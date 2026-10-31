"""The only module that knows a model provider exists (plan §7 Phase 5, backend step 1).

    call_vision(image, prompt, timeout) -> (dict, Used)      # provider JSON, unvalidated
    open_stream(prompt, timeout)        -> TextStream         # iterable of text chunks
    vision_json(...) / stream_text(...)                       # plan signatures, thin wrappers

Providers: "ollama" (local, no key), "fake" (tests). The primary provider is tried first; on any AiError
the backup (AI_BACKUP_*) is tried once. A stream that already produced text is never switched mid-way.
"""

import base64
import json
import logging
import threading
import time
from dataclasses import dataclass
from typing import Iterator

import httpx
from django.conf import settings

from .schemas import VISION_JSON_SCHEMA

logger = logging.getLogger(__name__)


class AiError(Exception):
    reason = "provider_error"


class AiUnavailable(AiError):
    reason = "not_configured"


class AiTimeout(AiError):
    reason = "timeout"


class AiBadOutput(AiError):
    reason = "bad_output"


@dataclass(frozen=True)
class Used:
    provider: str
    model: str


# --- providers -------------------------------------------------------------------------
def _ollama_error(response: httpx.Response) -> str:
    """Ollama explains failures in its JSON body ("model requires more system memory ..."); show that."""
    try:
        return str(response.json().get("error") or response.text)[:200]
    except ValueError:
        return response.text[:200] or f"HTTP {response.status_code}"


class OllamaProvider:
    """Local model through Ollama's native API (/api/chat). Images are base64, output is schema-constrained."""

    name = "ollama"

    def __init__(self, base_url: str, vision_model: str, text_model: str = "", transport=None):
        self.base_url = base_url.rstrip("/")
        self.vision_model = vision_model
        self.text_model = text_model or vision_model
        self._http = httpx.Client(transport=transport, timeout=None)

    def _chat_body(self, model, messages, *, stream, num_predict, temperature, fmt=None):
        body = {
            "model": model,
            "messages": messages,
            "stream": stream,
            "keep_alive": "30m",  # keep the model loaded between calls
            "options": {"temperature": temperature, "num_predict": num_predict, "num_ctx": settings.AI_NUM_CTX},
        }
        if fmt:
            body["format"] = fmt
        return body

    def vision_json(self, image: bytes, system: str, user: str, timeout: float) -> dict:
        if not self.vision_model:
            raise AiUnavailable("AI_VISION_MODEL is empty")
        body = self._chat_body(
            self.vision_model,
            [  # one user turn: small vision models follow instructions given next to the image far better
                {"role": "user", "content": f"{system}\n\n{user}".strip(), "images": [base64.b64encode(image).decode()]},
            ],
            stream=False, num_predict=300, temperature=0, fmt=VISION_JSON_SCHEMA,
        )
        try:
            r = self._http.post(f"{self.base_url}/api/chat", json=body, timeout=timeout)
            if r.status_code >= 400:
                raise AiError(f"ollama vision failed: {_ollama_error(r)}")
            content = r.json()["message"]["content"]
        except httpx.TimeoutException as exc:
            raise AiTimeout(str(exc)) from exc
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise AiError(f"ollama vision failed: {exc}") from exc
        try:
            return json.loads(content)
        except ValueError as exc:
            raise AiBadOutput(f"not JSON: {content[:80]!r}") from exc

    def ask_yes_no(self, image: bytes, question: str, timeout: float) -> str:
        """Plain (unconstrained) one-word answer about the image. Cheap after the first call: Ollama
        keeps the processed image, so a second question on the same photo takes about a second."""
        if not self.vision_model:
            raise AiUnavailable("AI_VISION_MODEL is empty")
        body = self._chat_body(
            self.vision_model,
            [{"role": "user", "content": question, "images": [base64.b64encode(image).decode()]}],
            stream=False, num_predict=6, temperature=0,
        )
        try:
            r = self._http.post(f"{self.base_url}/api/chat", json=body, timeout=timeout)
            if r.status_code >= 400:
                raise AiError(f"ollama gate failed: {_ollama_error(r)}")
            return str(r.json()["message"]["content"])
        except httpx.TimeoutException as exc:
            raise AiTimeout(str(exc)) from exc
        except (httpx.HTTPError, KeyError, ValueError) as exc:
            raise AiError(f"ollama gate failed: {exc}") from exc

    def stream_text(self, prompt: str, timeout: float) -> Iterator[str]:
        if not self.text_model:
            raise AiUnavailable("AI_TEXT_MODEL / AI_VISION_MODEL is empty")
        body = self._chat_body(
            self.text_model, [{"role": "user", "content": prompt}], stream=True, num_predict=250, temperature=0.2
        )
        deadline = time.monotonic() + timeout
        try:
            with self._http.stream("POST", f"{self.base_url}/api/chat", json=body, timeout=timeout) as r:
                if r.status_code >= 400:
                    r.read()
                    raise AiError(f"ollama stream failed: {_ollama_error(r)}")
                for line in r.iter_lines():
                    if time.monotonic() > deadline:
                        raise AiTimeout("brief exceeded its time budget")
                    if not line.strip():
                        continue
                    data = json.loads(line)
                    piece = (data.get("message") or {}).get("content", "")
                    if piece:
                        yield piece
                    if data.get("done"):
                        return
        except httpx.TimeoutException as exc:
            raise AiTimeout(str(exc)) from exc
        except (httpx.HTTPError, ValueError) as exc:
            raise AiError(f"ollama stream failed: {exc}") from exc

    def warm(self, timeout: float) -> None:
        """Load the model into memory so the first real call is not a cold start."""
        model = self.text_model or self.vision_model
        if not model:
            raise AiUnavailable("no model configured")
        try:
            r = self._http.post(
                f"{self.base_url}/api/generate", json={"model": model, "prompt": "", "keep_alive": "30m"}, timeout=timeout
            )
            if r.status_code >= 400:
                raise AiError(f"ollama warm failed: {_ollama_error(r)}")
        except httpx.TimeoutException as exc:
            raise AiTimeout(str(exc)) from exc
        except httpx.HTTPError as exc:
            raise AiError(f"ollama warm failed: {exc}") from exc


class FakeProvider:
    """Deterministic provider for tests: set attributes, then trigger the code under test."""

    name = "fake"
    vision_model = text_model = "fake-model"

    def __init__(self):
        self.reset()

    def reset(self):
        self.vision_result = {
            "is_accident": True, "collision_type": "FRONTAL", "vehicles_count": 1, "airbag_deployed": True, "deformation": "HIGH",
            "cabin_intrusion": False, "rollover": False, "fire_or_smoke": False,
            "likely_injuries": ["CHEST", "HEAD"], "impact_severity": "HIGH", "confidence": 0.8,
            "summary_fr": "Choc frontal, airbag déclenché.",
        }
        self.brief_chunks = ["PATIENT: inconnu\n", "MÉCANISME: inconnu\n", "ETA: inconnu"]
        self.error = None            # exception instance raised by every call
        self.stream_error_after = None  # raise after N chunks
        self.vision_delay = 0.0
        self.chunk_delay = 0.0
        self.gate_answers = ["yes"]  # answers to successive gate questions (cycled)
        self.calls = {"vision": 0, "stream": 0, "warm": 0, "gate": 0}
        self.last_prompt = None  # last brief prompt
        self.last_vision_prompt = None
        self.last_image = None

    def vision_json(self, image, system, user, timeout):
        self.calls["vision"] += 1
        self.last_image, self.last_vision_prompt = image, system
        if self.error:
            raise self.error
        if self.vision_delay:
            time.sleep(self.vision_delay)
        return self.vision_result

    def ask_yes_no(self, image, question, timeout):
        self.calls["gate"] += 1
        if self.error:
            raise self.error
        return self.gate_answers[(self.calls["gate"] - 1) % len(self.gate_answers)]

    def stream_text(self, prompt, timeout):
        self.calls["stream"] += 1
        self.last_prompt = prompt
        if self.error:
            raise self.error
        for i, chunk in enumerate(self.brief_chunks):
            if self.stream_error_after is not None and i >= self.stream_error_after:
                raise AiError("stream broke")
            if self.chunk_delay:
                time.sleep(self.chunk_delay)
            yield chunk

    def warm(self, timeout):
        self.calls["warm"] += 1
        if self.error:
            raise self.error


FAKE = FakeProvider()
_ollama_cache: dict[tuple, OllamaProvider] = {}
_cache_lock = threading.Lock()


def _build(name, base_url, vision_model, text_model):
    if name == "fake":
        return FAKE
    if name == "ollama":
        key = (base_url, vision_model, text_model)
        with _cache_lock:  # reuse the keep-alive HTTP client between calls
            if key not in _ollama_cache:
                _ollama_cache[key] = OllamaProvider(base_url, vision_model, text_model)
            return _ollama_cache[key]
    raise AiUnavailable(f"unknown AI provider {name!r}")


def get_providers() -> list:
    """[primary, backup?] from settings, read at call time. Empty list = AI disabled."""
    providers = []
    if settings.AI_PROVIDER:
        providers.append(_build(settings.AI_PROVIDER, settings.AI_BASE_URL, settings.AI_VISION_MODEL, settings.AI_TEXT_MODEL))
    if settings.AI_BACKUP_PROVIDER:
        providers.append(
            _build(
                settings.AI_BACKUP_PROVIDER,
                settings.AI_BACKUP_BASE_URL or settings.AI_BASE_URL,
                settings.AI_BACKUP_VISION_MODEL or settings.AI_VISION_MODEL,
                settings.AI_BACKUP_TEXT_MODEL or settings.AI_TEXT_MODEL,
            )
        )
    return providers


# --- public API --------------------------------------------------------------------------
def call_vision(image: bytes, prompt: str, user: str = "", timeout: float | None = None):
    timeout = settings.AI_VISION_TIMEOUT_S if timeout is None else timeout
    providers = get_providers()
    if not providers:
        raise AiUnavailable("AI_PROVIDER is not set")
    last: Exception | None = None
    for provider in providers:
        try:
            return provider.vision_json(image, prompt, user, timeout), Used(provider.name, provider.vision_model)
        except AiError as exc:
            logger.warning("vision failed on %s: %s", provider.name, exc)
            last = exc
    raise last  # type: ignore[misc]


def parse_yes_no(text: str) -> str | None:
    """'Yes.' / 'no, because...' -> 'yes' / 'no'; anything else -> None."""
    words = text.strip().lower().replace(".", " ").replace(",", " ").replace("!", " ").split()
    return words[0] if words and words[0] in ("yes", "no") else None


def call_gate(image: bytes, questions, timeout: float | None = None):
    """Ask the yes/no questions. Returns ("yes" | "no" | "unclear", Used): any "yes" -> yes (stops early),
    all "no" -> no, otherwise unclear. Backup provider on error, like the other calls."""
    timeout = settings.AI_VISION_TIMEOUT_S if timeout is None else timeout
    providers = get_providers()
    if not providers:
        raise AiUnavailable("AI_PROVIDER is not set")
    last: Exception | None = None
    for provider in providers:
        try:
            answers = []
            for question in questions:
                answer = parse_yes_no(provider.ask_yes_no(image, question, timeout))
                answers.append(answer)
                if answer == "yes":
                    break
            verdict = "yes" if "yes" in answers else "no" if answers and all(a == "no" for a in answers) else "unclear"
            return verdict, Used(provider.name, provider.vision_model)
        except AiError as exc:
            logger.warning("gate failed on %s: %s", provider.name, exc)
            last = exc
    raise last  # type: ignore[misc]


def vision_json(image_bytes: bytes, prompt: str, timeout: float | None = None) -> dict:
    return call_vision(image_bytes, prompt, timeout=timeout)[0]


class TextStream:
    """Iterator of text chunks. `.used` is set when the first chunk arrives."""

    def __init__(self, prompt: str, timeout: float):
        self._prompt, self._timeout = prompt, timeout
        self.used: Used | None = None

    def __iter__(self):
        providers = get_providers()
        if not providers:
            raise AiUnavailable("AI_PROVIDER is not set")
        last: Exception | None = None
        for provider in providers:
            started = False
            try:
                for chunk in provider.stream_text(self._prompt, self._timeout):
                    started = True
                    self.used = Used(provider.name, provider.text_model)
                    yield chunk
                if started:
                    return
                last = AiBadOutput("empty brief")
            except AiError as exc:
                if started:
                    raise  # never splice two providers' text
                logger.warning("brief stream failed on %s: %s", provider.name, exc)
                last = exc
        raise last  # type: ignore[misc]


def open_stream(prompt: str, timeout: float | None = None) -> TextStream:
    return TextStream(prompt, settings.AI_BRIEF_TIMEOUT_S if timeout is None else timeout)


def stream_text(prompt: str, timeout: float | None = None) -> Iterator[str]:
    return iter(open_stream(prompt, timeout))


def warm(timeout: float = 60.0) -> list[str]:
    """Pre-load models. Returns names of providers warmed; failures are logged, never raised."""
    ok = []
    for provider in get_providers():
        try:
            provider.warm(timeout)
            ok.append(provider.name)
        except AiError as exc:
            logger.warning("warm-up failed on %s: %s", provider.name, exc)
    return ok

# Najdaa design → app

Figma file: `Xjgep54jjOuAqXrE87J7b9` ("Najdaa"), one page, mobile frames 390×844. No dashboard frames in the file.

## Tokens (measured on the exported frames)

| Token | Value |
|---|---|
| page background | `#F4F0EF` |
| ink (text, black pills) | `#111111` |
| red (SOS, "Appeler le 14", NON) | `#D0021B` |
| green (OUI, success) | `#16804A` |
| yellow (SMS banner) | `#F4B400` |
| grey (chips, arch, progress track) | `#EAE5E3` |
| "Online" pill | bg `#DBEFE3`, dot `#24E881` |
| "Offline" pill | bg `#FFCCD2`, red text |
| body-map selected fill | `#E5919A` |

Code: `app/src/theme/tokens.ts`. Font: Montserrat (guessed from the renders, not read from Figma).

## Frames seen as images (`figma-shots/`)

welcome · safety question (q1) · victim count (q4) · body map (×2) · hazards · photo · duplicate sheet · alert sent · SMS mode.
(`figma-shots/a-…` is the empty "iPhone 13 & 14" frame, `f-…` the empty "M14 Dangers" section.)

## Frames still NOT seen (export as PNG into `design/`)

Seen so far: `figma-shots/` (welcome, safety, victim count, body map, hazards, photo, duplicate, alert sent, SMS) and
`image.png` … `image7.png` (welcome, permissions, medical profile, crash countdown, bystander, questions 1-3, "suivi" ×2).

| Frame | Node id | Built from the text only |
|---|---|---|
| home page 1 / 2 / 3 | 53:4298 / 53:4195 / 53:4408 | index, role |
| home variants | 52:2115, 53:4155 | index |
| role + "alert sent" banner | 53:4362 | role |
## Illustrations still to export (3D renders; slots in `app/src/components/Illustration.tsx`)

paramedic (welcome), warning triangle (safety), green check (alert sent), phone (SMS), SOS badge, ambulance.
Drop the PNGs in `app/assets/illustrations/` and register them in `ILLUSTRATIONS`.

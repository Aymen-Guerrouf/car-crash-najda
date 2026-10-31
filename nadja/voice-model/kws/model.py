"""Tiny depthwise-separable CNN for yes / no / other (needs torch; the app runs the exported numpy/TypeScript version).

Input [B, 1, 40, 98]. ~15k parameters, ~4.4 M multiply-adds: small enough for plain TypeScript in Expo Go.
"""

import torch
from torch import nn

CLASSES = ["other", "yes", "no"]            # index = class id (shared with the app)
# (in_channels, out_channels, stride) of the depthwise-separable blocks
BLOCKS = [(32, 48, 1), (48, 64, 2), (64, 64, 1), (64, 64, 2)]


class DSBlock(nn.Module):
    def __init__(self, cin: int, cout: int, stride: int):
        super().__init__()
        self.dw = nn.Conv2d(cin, cin, 3, stride=stride, padding=1, groups=cin, bias=False)
        self.bn1 = nn.BatchNorm2d(cin)
        self.pw = nn.Conv2d(cin, cout, 1, bias=False)
        self.bn2 = nn.BatchNorm2d(cout)

    def forward(self, x):
        x = torch.relu(self.bn1(self.dw(x)))
        return torch.relu(self.bn2(self.pw(x)))


class KWSNet(nn.Module):
    def __init__(self, n_classes: int = 3, dropout: float = 0.1):
        super().__init__()
        self.conv1 = nn.Conv2d(1, 32, 3, stride=2, padding=1, bias=False)
        self.bn1 = nn.BatchNorm2d(32)
        self.blocks = nn.Sequential(*[DSBlock(*b) for b in BLOCKS])
        self.drop = nn.Dropout(dropout)
        self.fc = nn.Linear(BLOCKS[-1][1], n_classes)

    def forward(self, x):
        x = torch.relu(self.bn1(self.conv1(x)))
        x = self.blocks(x)
        x = x.mean(dim=(2, 3))                      # global average pool
        return self.fc(self.drop(x))


def count_parameters(model: nn.Module) -> int:
    return sum(p.numel() for p in model.parameters())


def count_macs(h: int = 40, w: int = 98) -> int:
    """Multiply-adds of one forward pass, from the layer shapes (padding 1, 3x3)."""
    out = lambda n, s: (n + 2 - 3) // s + 1  # noqa: E731
    h, w = out(h, 2), out(w, 2)
    macs = h * w * 32 * 9                       # conv1 (1 -> 32)
    for cin, cout, stride in BLOCKS:
        h, w = out(h, stride), out(w, stride)
        macs += h * w * cin * 9 + h * w * cin * cout    # depthwise + pointwise
    return macs + BLOCKS[-1][1] * 3

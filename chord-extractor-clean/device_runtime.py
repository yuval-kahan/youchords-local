"""Detect whether this processor can use an NVIDIA CUDA device."""

from __future__ import annotations

from typing import Any


def resolve_compute_device(requested: str | None, cuda_available: bool) -> str:
    """Use CUDA when requested or automatic and available; otherwise use CPU."""
    choice = str(requested or "auto").strip().lower()
    if choice == "cpu":
        return "cpu"
    if choice in {"", "auto", "cuda", "gpu"} and cuda_available:
        return "cuda"
    return "cpu"


def inspect_torch_cuda(torch_module: Any | None = None) -> dict[str, Any]:
    """Return a safe CUDA availability snapshot without failing CPU startup."""
    try:
        if torch_module is None:
            import torch as torch_module  # type: ignore[no-redef]

        available = bool(torch_module.cuda.is_available())
        name = str(torch_module.cuda.get_device_name(0)) if available else None
        return {"available": available, "name": name, "error": None}
    except Exception as exc:
        return {"available": False, "name": None, "error": str(exc)[:300]}

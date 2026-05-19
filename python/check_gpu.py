"""GPU diagnostics — single entry point. Outputs JSON to stdout."""
import glob
import json
import platform
import subprocess
import sys
import os


def detect_system_gpu():
    """Check nvidia-smi for driver and GPU info."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "--query-gpu=driver_version,name,memory.total",
             "--format=csv,noheader,nounits"],
            capture_output=True, text=True, timeout=15
        )
        if result.returncode == 0 and result.stdout.strip():
            parts = [p.strip() for p in result.stdout.strip().split(",")]
            return {
                "driver_version": parts[0] if len(parts) > 0 else None,
                "gpu_name": parts[1] if len(parts) > 1 else None,
                "vram_mb": int(float(parts[2])) if len(parts) > 2 else None,
            }
    except Exception:
        pass
    return None


def detect_conda_cuda(system):
    """Detect CUDA installed via conda."""
    result = {
        "conda_cuda_found": False,
        "conda_cuda_version": None,
        "conda_cudnn_found": False,
    }
    try:
        conda_prefix = os.environ.get("CONDA_PREFIX")
        if conda_prefix:
            # Check cudatoolkit
            cp = subprocess.run(
                ["conda", "list", "cudatoolkit"],
                capture_output=True, text=True, timeout=10
            )
            if cp.returncode == 0 and "cudatoolkit" in cp.stdout:
                result["conda_cuda_found"] = True
                for line in cp.stdout.split("\n"):
                    if "cudatoolkit" in line:
                        parts = line.split()
                        if len(parts) >= 2:
                            result["conda_cuda_version"] = parts[1]

            # Check cudnn
            cp = subprocess.run(
                ["conda", "list", "cudnn"],
                capture_output=True, text=True, timeout=10
            )
            if cp.returncode == 0 and "cudnn" in cp.stdout:
                result["conda_cudnn_found"] = True
            if system == "Linux":
                lib_path = os.path.join(conda_prefix, "lib", "libcudart.so")
                if os.path.exists(lib_path):
                    result["conda_cuda_found"] = True
            elif system == "Windows":
                lib_pattern = os.path.join(conda_prefix, "Library", "bin", "cudart*.dll")
                if glob.glob(lib_pattern):
                    result["conda_cuda_found"] = True
    except Exception:
        pass
    return result


def main():
    system = platform.system()
    output = {
        "platform": system,
        "cuda_available": False,
        "driver_version": None,
        "cuda_version": None,
        "cudnn_version": None,
        "gpu_name": None,
        "vram_mb": None,
        "conda_cuda_found": False,
        "conda_cuda_version": None,
        "conda_cudnn_found": False,
        "mps_available": False,
        "issues": [],
        "recommendations": [],
    }

    # macOS: check MPS, no CUDA
    if system == "Darwin":
        try:
            import torch
            output["mps_available"] = torch.backends.mps.is_available()
            if not output["mps_available"]:
                output["issues"].append("MPS not available. Ensure you're on Apple Silicon with PyTorch >= 1.12.")
            else:
                output["recommendations"].append("MPS ready for GPU-accelerated training on macOS.")
        except Exception:
            output["issues"].append("PyTorch not installed. Run: pip install torch torchvision")
        print(json.dumps(output, ensure_ascii=False))
        return

    # Check PyTorch CUDA
    try:
        import torch
        output["cuda_available"] = torch.cuda.is_available()
        if output["cuda_available"]:
            output["cuda_version"] = torch.version.cuda
            try:
                output["cudnn_version"] = str(torch.backends.cudnn.version())
            except Exception:
                pass
    except Exception:
        output["issues"].append("PyTorch not installed. Install PyTorch first.")

    # Check nvidia-smi
    gpu_info = detect_system_gpu()
    if gpu_info:
        output.update(gpu_info)

    # Check nvidia-ml-py
    try:
        from pynvml import nvmlInit, nvmlShutdown, nvmlSystemGetDriverVersion, nvmlDeviceGetCount, nvmlDeviceGetHandleByIndex, nvmlDeviceGetName
        nvmlInit()
        ver = nvmlSystemGetDriverVersion()
        output["driver_version"] = ver.decode() if isinstance(ver, bytes) else str(ver)
        if nvmlDeviceGetCount() > 0:
            handle = nvmlDeviceGetHandleByIndex(0)
            name = nvmlDeviceGetName(handle)
            output["gpu_name"] = name.decode() if isinstance(name, bytes) else str(name)
        nvmlShutdown()
    except Exception:
        pass

    # Conda detection
    conda_info = detect_conda_cuda(system)
    output.update(conda_info)

    # Diagnose issues
    if not output.get("driver_version"):
        output["issues"].append("NVIDIA driver not detected. Install driver >= 525.x from: https://www.nvidia.com/download/")
    if not output["cuda_available"] and not output["conda_cuda_found"]:
        output["issues"].append("CUDA not available. For GPU training install PyTorch with CUDA support.")
    if output.get("driver_version") and output.get("cuda_version"):
        try:
            driver_major = int(output["driver_version"].split(".")[0])
            cuda_major = int(output["cuda_version"].split(".")[0]) if "." in str(output["cuda_version"]) else int(output["cuda_version"])
            min_driver = {11: 450, 12: 525, 13: 545}.get(cuda_major, 525)
            if driver_major < min_driver:
                output["issues"].append(f"Driver version {output['driver_version']} may be too old for CUDA {output['cuda_version']}.")
        except Exception:
            pass

    # Recommendations
    if output["cuda_available"]:
        cuda_ver = str(output.get("cuda_version", "12")).replace(".", "")[:4]
        output["recommendations"].append(f"GPU ready. Install: pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu{cuda_ver}")
    elif not output.get("issues"):
        output["recommendations"].append("CPU-only training available.")

    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    main()

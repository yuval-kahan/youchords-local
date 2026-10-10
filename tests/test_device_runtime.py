import unittest

from device_runtime import inspect_torch_cuda, resolve_compute_device


class FakeCuda:
    def __init__(self, available=True, name="Test NVIDIA GPU"):
        self.available = available
        self.name = name

    def is_available(self):
        return self.available

    def get_device_name(self, index):
        return self.name


class FakeTorch:
    def __init__(self, cuda):
        self.cuda = cuda


class DeviceRuntimeTests(unittest.TestCase):
    def test_auto_prefers_cuda_when_available(self):
        self.assertEqual(resolve_compute_device("auto", True), "cuda")

    def test_auto_falls_back_to_cpu_without_cuda(self):
        self.assertEqual(resolve_compute_device("auto", False), "cpu")

    def test_explicit_cuda_also_falls_back_to_cpu_without_cuda(self):
        self.assertEqual(resolve_compute_device("cuda", False), "cpu")

    def test_explicit_cpu_stays_on_cpu_when_cuda_exists(self):
        self.assertEqual(resolve_compute_device("cpu", True), "cpu")

    def test_inspection_reports_gpu_name(self):
        status = inspect_torch_cuda(FakeTorch(FakeCuda()))
        self.assertTrue(status["available"])
        self.assertEqual(status["name"], "Test NVIDIA GPU")

    def test_inspection_handles_cuda_runtime_errors(self):
        class BrokenCuda:
            def is_available(self):
                raise RuntimeError("no driver")

        status = inspect_torch_cuda(FakeTorch(BrokenCuda()))
        self.assertFalse(status["available"])
        self.assertIn("no driver", status["error"])


if __name__ == "__main__":
    unittest.main()

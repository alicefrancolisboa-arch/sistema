import json
import unittest
from pathlib import Path


ROOT = Path(__file__).parents[1]


class CloudflareWorkerConfigTest(unittest.TestCase):
    def test_uses_shared_turso_and_protects_secrets(self):
        config = json.loads((ROOT / "wrangler.jsonc").read_text(encoding="utf-8"))
        source = (ROOT / "worker.py").read_text(encoding="utf-8")
        self.assertEqual(config["name"], "aloha-casa-do-acai")
        self.assertEqual(config["vars"]["STORAGE_DRIVER"], "turso")
        self.assertNotIn("TURSO_AUTH_TOKEN", config.get("vars", {}))
        self.assertIn('_binding(self.env, "TURSO_AUTH_TOKEN")', source)
        self.assertIn('wsgi.fetch(_module.app', source)


if __name__ == "__main__":
    unittest.main()

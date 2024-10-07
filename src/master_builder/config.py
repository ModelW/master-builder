import os
from dataclasses import asdict, dataclass, field
from pathlib import Path

import yaml

from .errors import ErrorForUser


def detect_home():
    if "MB_HOME" in os.environ:
        return Path(os.environ["MB_HOME"])

    return Path.home() / ".master-builder"


_config: "Config | None" = None


@dataclass(frozen=True)
class PersistedConfig:
    init_done: bool = False
    enable_https: bool = False
    ssl_contact: str = ""
    ssl_key: str = ""
    ssl_cert: str = ""


@dataclass
class Config:
    home: Path = field(default_factory=detect_home)

    def project_dir(self, project_name: str) -> Path:
        return self.home / "deployments" / project_name

    def ensure_init(self):
        if not self.persisted.init_done:
            msg = "Please run `master-builder init` first"
            raise ErrorForUser(msg)

    @property
    def ingress_dir(self) -> Path:
        return self.home / "ingress"

    @property
    def traefik_dynamic_file(self) -> Path:
        return self.ingress_dir / "dynamic.yaml"

    @property
    def letsencrypt_dir(self) -> Path:
        return self.home / "letsencrypt"

    @property
    def config_file(self) -> Path:
        return self.home / "config.yml"

    @property
    def persisted(self) -> PersistedConfig:
        if not self.config_file.exists():
            return PersistedConfig()

        with self.config_file.open() as f:
            return PersistedConfig(**yaml.safe_load(f))

    @persisted.setter
    def persisted(self, value: PersistedConfig):
        self.config_file.parent.mkdir(parents=True, exist_ok=True)

        with self.config_file.open("w") as f:
            yaml.safe_dump(asdict(value), f)

    @classmethod
    def instance(cls, no_init_required: bool = False) -> "Config":
        global _config

        if _config is None:
            _config = cls()

            if not no_init_required:
                _config.ensure_init()

        return _config

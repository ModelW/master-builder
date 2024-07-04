try:
    from importlib.metadata import PackageNotFoundError, version
except ImportError:  # pragma: no cover
    __version__ = "unknown"
else:
    try:
        __version__ = version("master-builder")
    except PackageNotFoundError:  # pragma: no cover
        __version__ = "unknown"

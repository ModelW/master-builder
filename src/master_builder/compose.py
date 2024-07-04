import rich_click as click
from rich.console import Console

from .config import Config
from .errors import ErrorForUser
from .reporting import handle_fatal, run_command

console = Console()


@click.command()
@click.argument("project_name")
@click.argument("compose_args", nargs=-1)
@handle_fatal
def compose(project_name: str, compose_args: tuple[str, ...]):
    """Run Docker Compose commands for a project."""
    config = Config.instance()
    project_dir = config.project_dir(project_name)

    try:
        latest_deploy = max(
            (d for d in project_dir.iterdir() if d.is_dir()),
            key=lambda d: d.stat().st_mtime,
        )
    except ValueError:
        msg = f"No deployments found for project {project_name}"
        raise ErrorForUser(msg) from None

    run_command(["docker", "compose", *compose_args], cwd=latest_deploy)

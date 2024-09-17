import shlex
import subprocess
from collections.abc import Callable
from contextlib import contextmanager
from functools import wraps
from pathlib import Path

from rich.console import Console
from rich.panel import Panel
from rich.traceback import Traceback

from .errors import ErrorForUser

console = Console(force_terminal=True)


def handle_fatal(func: Callable):
    """
    A decorator that catches any exception and calls fatal() with it.

    Parameters
    ----------
    func
        The function to decorate
    """

    @wraps(func)
    def wrapper(*args, **kwargs):
        try:
            return func(*args, **kwargs)
        except Exception as e:
            fatal(e)

    return wrapper


@contextmanager
def action(message: str):
    """
    Displays "action" blocks when a function is called

    Parameters
    ----------
    message
        The message to display
    """

    console.print(f"\n[magenta]==[ [bold]{message}[/bold] ]==\n")
    yield


def fatal(err: Exception):
    """
    Called when a fatal exception occurred. Displays the error nicely and
    crashes the program.

    Parameters
    ----------
    err
        The error that occurred
    """

    if isinstance(err, ErrorForUser):
        error_message = str(err)
        panel = Panel(error_message, title="Error", border_style="red", expand=False)
        console.print(panel)
    elif isinstance(err, subprocess.CalledProcessError):
        error_message = f"Command failed with return code {err.returncode}"
        panel = Panel(error_message, title="Error", border_style="red", expand=False)
        console.print(panel)
    else:
        console.print(Traceback.from_exception(type(err), err, err.__traceback__))

    exit(1)


def success(message: str):
    """
    Displays a success message.

    Parameters
    ----------
    message
        The message to display
    """

    console.print(Panel.fit(message, title="Success", border_style="green"))


def run_command(
    command: list[str],
    cwd: Path | None = None,
    check: bool = True,
    capture: bool = False,
    quiet: bool = False,
):
    """
    Runs a command and prints it to the console.

    Parameters
    ----------
    command
        The command to run
    cwd
        The directory to run the command in
    check
        Whether to check the return code of the command
    capture
        Whether to capture the output of the command
    quiet
        Do not announce the command before running it
    """

    if not quiet:
        cmd = " ".join(shlex.quote(x) for x in command)
        console.print(f"\n[blue]--> Running: [blue bold]{cmd}\n")

    try:
        return subprocess.run(
            command,
            cwd=cwd,
            check=check,
            capture_output=capture,
            encoding="utf-8" if capture else None,
        )
    finally:
        if not quiet:
            print("\n")  # noqa T201

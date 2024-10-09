import re

import rich_click as click

from .config import Config, PersistedConfig
from .errors import ErrorForUser
from .reporting import handle_fatal, success


def validate_email(email):
    pattern = r"^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$"

    if re.match(pattern, email):
        local_part, domain = email.rsplit("@", 1)

        if len(email) > 254:
            return False
        if len(local_part) > 64:
            return False
        if domain.startswith(".") or domain.endswith("."):
            return False
        if ".." in domain:
            return False

        return True
    else:
        return False


@click.command()
@click.option(
    "--ssl-contact",
    help="Email address for the SSL certificate contact",
)
@click.option(
    "--ssl-key",
    help="Path to the SSL key file",
)
@click.option(
    "--ssl-cert",
    help="Path to the SSL certificate file",
)
@click.option(
    "--enable-https",
    is_flag=True,
    help="Enable HTTPS for the project. If yes, --ssl-contact is required.",
)
@handle_fatal
def init(ssl_contact: str, enable_https: bool, ssl_key: str, ssl_cert: str):
    """Registers static values that are required for the project to work."""

    config = Config.instance(no_init_required=True)
    extra = {}

    if enable_https:
        has_contact = bool(ssl_contact)
        has_static = bool(ssl_key) and bool(ssl_cert)

        if has_contact and has_static:
            msg = (
                "Provide either a contact for Let's Encrypt or a certificate "
                "and key file, but not both."
            )
            raise ErrorForUser(msg)

        if has_static:
            extra = {
                "ssl_key": ssl_key,
                "ssl_cert": ssl_cert,
                "ssl_contact": "",
            }
        elif has_contact:
            extra = {
                "ssl_contact": ssl_contact,
                "ssl_key": "",
                "ssl_cert": "",
            }

            if not validate_email(ssl_contact):
                msg = f"Invalid email address: {ssl_contact!r}."
                raise ErrorForUser(msg)
        else:
            msg = (
                "If you want to enable HTTPS, you need to provide an email "
                "address for the SSL certificate contact."
            )
            raise ErrorForUser(msg)

    config.persisted = PersistedConfig(
        init_done=True,
        enable_https=enable_https,
        **extra,
    )

    success("Initialization done.")

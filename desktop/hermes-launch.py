"""Apply Apollo's conversation policy, then run the unmodified Hermes backend."""
from pathlib import Path
import os
import runpy

APOLLO_IDENTITY = ''  # The model keeps its own identity; Apollo adds no persona.


def migrate_default_identity(home, original_default, is_legacy):
    """Replace only auto-seeded personas inside Apollo's own profile tree."""
    home = Path(home)
    homes = [home]
    profiles = home / "profiles"
    if profiles.is_dir() and not profiles.is_symlink():
        homes += [p for p in profiles.iterdir() if p.is_dir() and not p.is_symlink()]
    for profile in homes:
        file = profile / "SOUL.md"
        if file.is_symlink():
            continue
        if file.exists():
            content = file.read_text(encoding="utf-8-sig")
            if content.strip() != original_default.strip() and not is_legacy(content):
                continue
        profile.mkdir(parents=True, exist_ok=True)
        temporary = file.with_name("SOUL.md.apollo-tmp")
        temporary.write_text(APOLLO_IDENTITY, encoding="utf-8")
        os.replace(temporary, file)


def apply_apollo_policy():
    from agent import onboarding
    from hermes_cli import default_soul
    from agent import prompt_builder

    original_default = default_soul.DEFAULT_SOUL_MD
    # Hermes adds this note to the first user turn independently of its persona.
    # Disable the producer; never filter or rewrite the model's response text.
    onboarding.first_contact_turn_note = lambda *args, **kwargs: None
    default_soul.DEFAULT_SOUL_MD = APOLLO_IDENTITY
    prompt_builder.DEFAULT_AGENT_IDENTITY = APOLLO_IDENTITY
    from hermes_cli import config
    from agent import system_prompt
    config.DEFAULT_SOUL_MD = APOLLO_IDENTITY
    system_prompt.DEFAULT_AGENT_IDENTITY = APOLLO_IDENTITY
    system_prompt.HERMES_AGENT_HELP_GUIDANCE = ""
    system_prompt.HERMES_AGENT_HELP_GUIDANCE_NO_SKILLS = ""
    # Tools carry their own schemas. The host does not dictate a work style or flow.
    system_prompt._guidance_parts = lambda agent: []
    system_prompt._coding_parts = lambda agent: ([], [], [])
    system_prompt._alibaba_identity_part = lambda agent: []
    # Resumed conversations otherwise restore the pre-upgrade identity verbatim.
    # Use Hermes' normal rebuild/persist path once, then keep its cache behavior.
    from agent import conversation_loop
    native_matches = conversation_loop._stored_prompt_matches_runtime
    def matches_apollo_runtime(agent, prompt):
        if prompt.startswith(original_default.strip()):
            return False
        return native_matches(agent, prompt)
    conversation_loop._stored_prompt_matches_runtime = matches_apollo_runtime
    from hermes_constants import get_hermes_home
    migrate_default_identity(get_hermes_home(), original_default, default_soul.is_legacy_template_soul)


if __name__ == "__main__":
    apply_apollo_policy()
    runpy.run_module("hermes_cli.main", run_name="__main__")

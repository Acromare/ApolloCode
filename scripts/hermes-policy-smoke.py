"""Verify first-contact policy and safe migration against native Hermes imports."""
from pathlib import Path
import json
import os
import sys
import tempfile
import importlib.util

root = Path(__file__).resolve().parent.parent
sys.path[:0] = [str(root / 'vendor/hermes-engine'), str(root / 'desktop')]
with tempfile.TemporaryDirectory(prefix='hermes-policy-', dir=root / 'work') as directory:
    home = Path(directory)
    os.environ['HERMES_HOME'] = str(home)
    os.environ['HERMES_RUNTIME_DIR'] = str(home / 'dependencies')
    spec = importlib.util.spec_from_file_location('hermes_launch', root / 'desktop/hermes-launch.py')
    hermes_launch = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(hermes_launch)
    from hermes_cli.default_soul import DEFAULT_SOUL_MD, is_legacy_template_soul
    (home / 'SOUL.md').write_text(DEFAULT_SOUL_MD, encoding='utf-8')
    custom = home / 'profiles/custom'
    custom.mkdir(parents=True)
    custom_text = 'My own persona: respond with short technical explanations.'
    (custom / 'SOUL.md').write_text(custom_text, encoding='utf-8')
    hermes_launch.apply_apollo_policy()
    from agent import onboarding, prompt_builder, system_prompt
    from hermes_cli import config
    for mode in ('ask', 'off'):
        assert onboarding.first_contact_turn_note({'onboarding': {'profile_build': mode}}, home / 'config.yaml', session_history_empty=True, install_has_prior_sessions=False, message='你好') is None
    assert (home / 'SOUL.md').read_text(encoding='utf-8').strip() == hermes_launch.APOLLO_IDENTITY
    assert (custom / 'SOUL.md').read_text(encoding='utf-8') == custom_text
    assert prompt_builder.DEFAULT_AGENT_IDENTITY == system_prompt.DEFAULT_AGENT_IDENTITY == config.DEFAULT_SOUL_MD == hermes_launch.APOLLO_IDENTITY
    assert system_prompt._guidance_parts(None) == []
    assert system_prompt._coding_parts(None) == ([], [], [])
    assert not system_prompt.HERMES_AGENT_HELP_GUIDANCE
    from agent import conversation_loop
    from types import SimpleNamespace
    assert not conversation_loop._stored_prompt_matches_runtime(SimpleNamespace(), DEFAULT_SOUL_MD + '\n\nStored guidance')
    report = {'ok': True, 'checks': ['native first-contact notes disabled for ask and off', 'auto-seeded identity removed', 'custom persona preserved', 'no preset work style, workflow or product help injection', 'native identity fallback and seeding are empty', 'old default cached persona triggers native prompt rebuild on resume']}
    (root / 'work/hermes-policy-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report))

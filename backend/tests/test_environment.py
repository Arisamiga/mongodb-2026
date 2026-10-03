from app.config import Settings


def test_settings_load_repository_environment_independently_of_working_directory(
    tmp_path,
    monkeypatch,
):
    root = tmp_path / "project"
    module = root / "backend/app/config.py"
    module.parent.mkdir(parents=True)
    module.touch()
    (root / ".env").write_text(
        "JWT_SECRET=test-only-secret-with-at-least-32-characters\nMONGODB_DATABASE=root_config\n"
    )
    child = root / "backend"
    (child / ".env").write_text("MONGODB_DATABASE=obsolete_child_config\n")
    monkeypatch.chdir(child)
    monkeypatch.delenv("JWT_SECRET", raising=False)
    monkeypatch.delenv("MONGODB_DATABASE", raising=False)
    monkeypatch.setitem(Settings.model_config, "env_file", module.resolve().parents[2] / ".env")
    assert Settings().mongodb_database == "root_config"
    monkeypatch.setenv("MONGODB_DATABASE", "environment_override")
    assert Settings().mongodb_database == "environment_override"

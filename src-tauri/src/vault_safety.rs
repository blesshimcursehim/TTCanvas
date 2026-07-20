// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

//! Shared containment checks for every filesystem path derived from a
//! user-chosen vault folder. A vault's *location* is trusted (picked via a
//! native OS folder dialog), but its *contents* are not - a vault received
//! from someone else (or shared/synced) can contain a symlink planted to
//! redirect a read or write outside it. Every command that touches
//! vault-relative paths should go through one of the functions here rather
//! than joining paths by hand.
//!
//! These checks are re-run as close as possible to the filesystem operation
//! that uses their result, which narrows but - short of directory-capability
//! APIs like `openat`/`cap-std` - cannot fully eliminate the window between
//! the check and the operation. A symlink swapped in during that window is a
//! real, if narrow, residual risk; closing it fully is tracked as future work
//! rather than attempted here.

use crate::error::CommandError;
use std::fs;
use std::path::{Component, Path, PathBuf};

/// Rejects a bare file/id component that isn't a plain name: empty, `.`/`..`,
/// or one that embeds a path separator. Used for inputs (like `member_id`)
/// that get formatted straight into a filename rather than joined as a path.
pub(crate) fn validate_component(name: &str) -> Result<(), CommandError> {
    if name.is_empty() || name == "." || name == ".." || name.contains(['/', '\\']) {
        return Err(CommandError::Other(
            "must be a plain name with no path separators".to_string(),
        ));
    }
    Ok(())
}

/// Verifies that `target` (inside `vault_path`) is still physically inside
/// the vault, by canonicalizing the vault root and the nearest existing
/// ancestor of `target` and checking containment. Doesn't create anything.
pub(crate) fn verify_contained(vault_path: &str, target: &Path) -> Result<(), CommandError> {
    let vault_base = Path::new(vault_path);
    let canonical_vault = vault_base
        .canonicalize()
        .map_err(|_| CommandError::Other("vault path does not exist".to_string()))?;

    let mut probe = target;
    let existing_ancestor = loop {
        if probe.exists() {
            break probe;
        }
        match probe.parent() {
            Some(parent) => probe = parent,
            None => break vault_base,
        }
    };
    let canonical_ancestor = existing_ancestor
        .canonicalize()
        .map_err(|_| CommandError::Other("invalid path".to_string()))?;
    if !canonical_ancestor.starts_with(&canonical_vault) {
        return Err(CommandError::Other("path escapes vault".to_string()));
    }
    Ok(())
}

/// Rejects `path` when its final component is itself a symlink.
/// `symlink_metadata` (lstat) does *not* follow the link - unlike
/// `Path::exists()`/`metadata()`, which do - so a symlink planted at the exact
/// destination name is caught here even when it's *dangling* (its target
/// doesn't exist yet), the one case `verify_contained`'s `exists()`-based walk
/// skips over. Call this right before the actual `fs::write`/`fs::copy`/
/// `fs::read` so a planted final component can't redirect the operation out of
/// the vault. A path that doesn't exist at all, or exists as a real file/dir,
/// both pass.
pub(crate) fn reject_symlink(path: &Path) -> Result<(), CommandError> {
    match fs::symlink_metadata(path) {
        Ok(meta) if meta.file_type().is_symlink() => Err(CommandError::Other(
            "destination path is a symlink".to_string(),
        )),
        _ => Ok(()),
    }
}

/// Joins `relative` onto `vault_path`, rejecting anything that isn't a plain
/// relative path (no `..`, no root/drive prefix) and then verifying
/// containment - so a symlink planted inside the vault can't be used to
/// redirect a read/write/delete outside it.
pub(crate) fn safe_join(vault_path: &str, relative: &str) -> Result<PathBuf, CommandError> {
    let relative_path = Path::new(relative);
    if relative_path.as_os_str().is_empty() {
        return Err(CommandError::Other(
            "relative_path must not be empty".to_string(),
        ));
    }
    for component in relative_path.components() {
        if !matches!(component, Component::Normal(_)) {
            return Err(CommandError::Other(
                "relative_path must be a plain relative path".to_string(),
            ));
        }
    }

    let vault_base = Path::new(vault_path);
    let joined = vault_base.join(relative_path);
    verify_contained(vault_path, &joined)?;
    Ok(joined)
}

/// Ensures `vault_path/dir_name` exists and is physically inside the vault,
/// then returns its path. `dir_name` must be a fixed, non-attacker-controlled
/// literal (e.g. "maps", ".ttcanvas") - this guards against the directory
/// *itself* being a symlink planted in a vault someone else authored, not
/// against arbitrary relative-path input (use `safe_join` for that).
pub(crate) fn ensure_contained_dir(
    vault_path: &str,
    dir_name: &str,
) -> Result<PathBuf, CommandError> {
    let dir = Path::new(vault_path).join(dir_name);
    fs::create_dir_all(&dir)?;
    verify_contained(vault_path, &dir)?;
    Ok(dir)
}

/// Checks that `candidate` is exactly the vault's `maps` or `portraits`
/// directory - the only two folders the (untrusted) player webview is ever
/// allowed to read images from via `read_player_image_base64`. Canonicalizes
/// the trusted vault root and `candidate` independently and requires the
/// latter to sit exactly one, correctly-named path component below the
/// former, rather than comparing `candidate` against a canonicalized
/// `vault_path.join("maps")` directly - the latter would still "match" even
/// if `maps` itself were a symlink escaping the vault, since both sides of
/// that comparison would follow the same symlink to the same place.
pub(crate) fn is_allowed_player_image_dir(vault_path: &Path, candidate: &Path) -> bool {
    let Ok(canonical_vault) = vault_path.canonicalize() else {
        return false;
    };
    let Ok(canonical_candidate) = candidate.canonicalize() else {
        return false;
    };
    let Ok(relative) = canonical_candidate.strip_prefix(&canonical_vault) else {
        return false;
    };
    relative == Path::new("maps") || relative == Path::new("portraits")
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Creates a fresh, uniquely named vault directory under the OS temp dir
    /// so the containment checks have a real path to resolve.
    fn temp_vault(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ttcanvas_test_{name}_{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn safe_join_allows_normal_relative_path() {
        let vault = temp_vault("normal_relative");
        fs::create_dir_all(vault.join("npcs")).unwrap();
        let result = safe_join(vault.to_str().unwrap(), "npcs/goblin.md");
        assert!(result.is_ok());
        assert!(result.unwrap().ends_with("npcs/goblin.md"));
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn safe_join_allows_simple_filename() {
        let vault = temp_vault("simple_filename");
        let result = safe_join(vault.to_str().unwrap(), "session.md");
        assert!(result.is_ok());
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn safe_join_allows_new_nested_path_with_no_existing_subfolder() {
        // The target file (and its parent folder) don't exist yet - this is
        // the normal shape of a first write to a new note - so the ancestor
        // walk should land on the vault root itself and still succeed.
        let vault = temp_vault("new_nested");
        let result = safe_join(vault.to_str().unwrap(), "new-folder/new-file.md");
        assert!(result.is_ok());
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn safe_join_rejects_parent_traversal() {
        let vault = temp_vault("parent_traversal");
        let result = safe_join(vault.to_str().unwrap(), "../secret.txt");
        assert!(result.is_err());
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn safe_join_rejects_nested_traversal() {
        let vault = temp_vault("nested_traversal");
        let result = safe_join(vault.to_str().unwrap(), "npcs/../../etc/passwd");
        assert!(result.is_err());
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn safe_join_rejects_traversal_in_middle() {
        let vault = temp_vault("middle_traversal");
        let result = safe_join(vault.to_str().unwrap(), "a/../b/file.md");
        assert!(result.is_err());
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn safe_join_rejects_absolute_path() {
        let vault = temp_vault("absolute_path");
        let result = safe_join(vault.to_str().unwrap(), "/etc/passwd");
        assert!(result.is_err());
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn safe_join_rejects_empty_relative_path() {
        let vault = temp_vault("empty_relative");
        let result = safe_join(vault.to_str().unwrap(), "");
        assert!(result.is_err());
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    #[cfg(unix)]
    fn safe_join_rejects_symlink_that_resolves_outside_vault() {
        let vault = temp_vault("symlink_escape_vault");
        let outside = temp_vault("symlink_escape_outside");
        std::os::unix::fs::symlink(&outside, vault.join("npcs")).unwrap();

        let result = safe_join(vault.to_str().unwrap(), "npcs/goblin.md");
        assert!(result.is_err());

        let _ = fs::remove_dir_all(&vault);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    #[cfg(unix)]
    fn reject_symlink_rejects_a_dangling_final_component_symlink() {
        // The case verify_contained's exists()-based walk misses: a symlink
        // whose target doesn't exist yet, planted at the exact write target.
        let vault = temp_vault("reject_symlink_dangling");
        let link = vault.join("note.md");
        std::os::unix::fs::symlink(vault.join("does-not-exist-yet"), &link).unwrap();

        assert!(reject_symlink(&link).is_err());

        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    #[cfg(unix)]
    fn reject_symlink_rejects_a_symlink_to_an_existing_outside_file() {
        let vault = temp_vault("reject_symlink_existing");
        let outside = temp_vault("reject_symlink_outside");
        let secret = outside.join("secret.txt");
        fs::write(&secret, b"secret").unwrap();
        let link = vault.join("map.png");
        std::os::unix::fs::symlink(&secret, &link).unwrap();

        assert!(reject_symlink(&link).is_err());

        let _ = fs::remove_dir_all(&vault);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn reject_symlink_allows_a_real_file_and_a_nonexistent_path() {
        let vault = temp_vault("reject_symlink_ok");
        let real = vault.join("note.md");
        fs::write(&real, b"hi").unwrap();

        assert!(reject_symlink(&real).is_ok());
        assert!(reject_symlink(&vault.join("not-there-yet.md")).is_ok());

        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn ensure_contained_dir_creates_and_returns_a_normal_subfolder() {
        let vault = temp_vault("ensure_normal");
        let result = ensure_contained_dir(vault.to_str().unwrap(), "maps");
        assert!(result.is_ok());
        assert!(result.unwrap().is_dir());
        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    #[cfg(unix)]
    fn ensure_contained_dir_rejects_a_symlinked_subfolder_pointing_outside_vault() {
        let vault = temp_vault("ensure_symlink_vault");
        let outside = temp_vault("ensure_symlink_outside");
        std::os::unix::fs::symlink(&outside, vault.join("maps")).unwrap();

        let result = ensure_contained_dir(vault.to_str().unwrap(), "maps");
        assert!(result.is_err());

        let _ = fs::remove_dir_all(&vault);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    fn validate_component_allows_plain_name() {
        assert!(validate_component("goblin-1").is_ok());
    }

    #[test]
    fn validate_component_rejects_empty() {
        assert!(validate_component("").is_err());
    }

    #[test]
    fn validate_component_rejects_dot_and_dotdot() {
        assert!(validate_component(".").is_err());
        assert!(validate_component("..").is_err());
    }

    #[test]
    fn validate_component_rejects_embedded_separators() {
        assert!(validate_component("../secret").is_err());
        assert!(validate_component("npcs/goblin").is_err());
        assert!(validate_component("npcs\\goblin").is_err());
    }

    #[test]
    fn is_allowed_player_image_dir_accepts_maps_and_portraits() {
        let vault = temp_vault("player_image_allowed");
        fs::create_dir_all(vault.join("maps")).unwrap();
        fs::create_dir_all(vault.join("portraits")).unwrap();

        assert!(is_allowed_player_image_dir(&vault, &vault.join("maps")));
        assert!(is_allowed_player_image_dir(
            &vault,
            &vault.join("portraits")
        ));

        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn is_allowed_player_image_dir_rejects_other_vault_folders() {
        let vault = temp_vault("player_image_other_folder");
        fs::create_dir_all(vault.join("npcs")).unwrap();

        assert!(!is_allowed_player_image_dir(&vault, &vault.join("npcs")));
        assert!(!is_allowed_player_image_dir(&vault, &vault));

        let _ = fs::remove_dir_all(&vault);
    }

    #[test]
    fn is_allowed_player_image_dir_rejects_paths_outside_the_vault() {
        let vault = temp_vault("player_image_vault");
        let outside = temp_vault("player_image_outside");

        assert!(!is_allowed_player_image_dir(&vault, &outside));
        assert!(!is_allowed_player_image_dir(
            &vault,
            Path::new("/definitely/does/not/exist")
        ));

        let _ = fs::remove_dir_all(&vault);
        let _ = fs::remove_dir_all(&outside);
    }

    #[test]
    #[cfg(unix)]
    fn is_allowed_player_image_dir_rejects_a_symlinked_maps_folder_pointing_outside_vault() {
        let vault = temp_vault("player_image_symlink_vault");
        let outside = temp_vault("player_image_symlink_outside");
        std::os::unix::fs::symlink(&outside, vault.join("maps")).unwrap();

        assert!(!is_allowed_player_image_dir(&vault, &vault.join("maps")));

        let _ = fs::remove_dir_all(&vault);
        let _ = fs::remove_dir_all(&outside);
    }
}

// SPDX-License-Identifier: GPL-3.0-or-later
// Copyright (C) 2026 blesshimcursehim
//
// Plugins loaded via the official Plugin SDK are not considered
// derivative works; see the Plugin Exception in LICENSE.

import { useState } from "react";
import styles from "./FileTree.module.css";

interface TreeNode {
  name: string;
  path: string;
  isFolder: boolean;
  children: TreeNode[];
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .map((n) => ({ ...n, children: sortTree(n.children) }))
    .sort((a, b) => {
      if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

export function buildFileTree(paths: string[]): TreeNode[] {
  const folderChildren = new Map<string, TreeNode[]>();
  const roots: TreeNode[] = [];

  for (const raw of paths) {
    const normalized = raw.replace(/\\/g, "/");
    if (normalized.startsWith(".ttcanvas/")) continue;

    const segments = normalized.split("/");
    let currentChildren = roots;
    let keyPrefix = "";

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLast = i === segments.length - 1;
      const key = keyPrefix ? `${keyPrefix}/${seg}` : seg;

      if (isLast) {
        currentChildren.push({ name: seg, path: normalized, isFolder: false, children: [] });
      } else {
        if (!folderChildren.has(key)) {
          const folderNode: TreeNode = { name: seg, path: "", isFolder: true, children: [] };
          folderChildren.set(key, folderNode.children);
          currentChildren.push(folderNode);
        }
        currentChildren = folderChildren.get(key)!;
        keyPrefix = key;
      }
    }
  }

  return sortTree(roots);
}

function defaultExpandedMap(nodes: TreeNode[], prefix = ""): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const node of nodes) {
    if (!node.isFolder) continue;
    const key = prefix ? `${prefix}/${node.name}` : node.name;
    map.set(key, prefix === "");
    const nested = defaultExpandedMap(node.children, key);
    nested.forEach((v, k) => map.set(k, v));
  }
  return map;
}

interface FileTreeProps {
  nodes: TreeNode[];
  selectedFile: string | null;
  onSelect: (path: string) => void;
}

interface TreeLevelProps {
  nodes: TreeNode[];
  depth: number;
  parentKey: string;
  expanded: Map<string, boolean>;
  toggle: (key: string) => void;
  selectedFile: string | null;
  onSelect: (path: string) => void;
}

function TreeLevel({ nodes, depth, parentKey, expanded, toggle, selectedFile, onSelect }: TreeLevelProps) {
  return (
    <>
      {nodes.map((node) => {
        const key = parentKey ? `${parentKey}/${node.name}` : node.name;
        const isOpen = expanded.get(key) ?? false;
        const displayName = node.isFolder ? node.name : node.name.replace(/\.md$/, "");

        if (node.isFolder) {
          return (
            <div key={key}>
              <div
                className={`${styles.row} ${styles.folderRow}`}
                style={{ paddingLeft: depth * 14 + 6 }}
                onClick={() => toggle(key)}
              >
                <span className={styles.toggleIcon}>{isOpen ? "▼" : "▶"}</span>
                {displayName}
              </div>
              {isOpen && (
                <TreeLevel
                  nodes={node.children}
                  depth={depth + 1}
                  parentKey={key}
                  expanded={expanded}
                  toggle={toggle}
                  selectedFile={selectedFile}
                  onSelect={onSelect}
                />
              )}
            </div>
          );
        }

        const isSelected = node.path === selectedFile;
        return (
          <div
            key={key}
            className={`${styles.row} ${styles.fileRow}${isSelected ? ` ${styles.selected}` : ""}`}
            style={{ paddingLeft: depth * 14 + 16 }}
            onClick={() => onSelect(node.path)}
          >
            {displayName}
          </div>
        );
      })}
    </>
  );
}

export function FileTree({ nodes, selectedFile, onSelect }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Map<string, boolean>>(() =>
    defaultExpandedMap(nodes)
  );

  function toggle(key: string) {
    setExpanded((prev) => {
      const next = new Map(prev);
      next.set(key, !prev.get(key));
      return next;
    });
  }

  return (
    <div className={styles.tree}>
      <TreeLevel
        nodes={nodes}
        depth={0}
        parentKey=""
        expanded={expanded}
        toggle={toggle}
        selectedFile={selectedFile}
        onSelect={onSelect}
      />
    </div>
  );
}

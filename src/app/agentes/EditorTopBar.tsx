export function EditorTopBar() {
  return (
    <div>
      {false && (
        <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)', flexShrink: 0 }}>alterações não salvas</span>
      )}
    </div>
  );
}

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
import "./RichTextEditor.css";

type RichTextEditorProps = {
  value: string;
  onChange: (html: string) => void;
  /** Token buttons rendered in the toolbar (e.g. "name", "email") -- clicking
   * one inserts `{{token}}` at the current cursor position. Used by
   * EmailComposePanel/EmailTemplatesPanel to let an admin build personalized
   * copy without typing the {{...}} syntax by hand. */
  tokens?: string[];
  placeholder?: string;
};

/** Minimal WYSIWYG body editor for the Email module (template/campaign
 * body_html) -- Tiptap's React bindings, chosen over react-quill because
 * they don't rely on ReactDOM.findDOMNode (deprecated/removed, a known
 * react-quill pain point under React 18+ strict mode / React 19). */
export default function RichTextEditor({ value, onChange, tokens, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [StarterKit, Link.configure({ openOnClick: false })],
    content: value,
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
    editorProps: {
      attributes: {
        class: "rte-content",
        ...(placeholder ? { "data-placeholder": placeholder } : {}),
      },
    },
  });

  // Keep the editor in sync when `value` changes from outside (e.g.
  // switching which template is being edited, or loading a template into
  // the compose panel) -- Tiptap only reads `content` once at mount.
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  function insertToken(token: string) {
    editor?.chain().focus().insertContent(`{{${token}}}`).run();
  }

  if (!editor) return null;

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <button
          type="button"
          className={editor.isActive("bold") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleBold().run()}
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className={editor.isActive("italic") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className={editor.isActive("bulletList") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          • List
        </button>
        <button
          type="button"
          className={editor.isActive("orderedList") ? "active" : ""}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1. List
        </button>
        <button
          type="button"
          className={editor.isActive("link") ? "active" : ""}
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) editor.chain().focus().setLink({ href: url }).run();
          }}
        >
          Link
        </button>
        {tokens && tokens.length > 0 && (
          <span className="rte-tokens">
            {tokens.map((t) => (
              <button type="button" key={t} className="rte-token-btn" onClick={() => insertToken(t)}>
                {`{{${t}}}`}
              </button>
            ))}
          </span>
        )}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}

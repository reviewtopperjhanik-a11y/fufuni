/**
 * Copyright (c) 2024-2026 Ronan LE MEILLAT
 * License: AGPL-3.0-or-later
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, either version 3 of the
 * License, or (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <http://www.gnu.org/licenses/>.
 */

/**
 * RichHtmlEditor — a simple TipTap-based WYSIWYG editor for plain HTML.
 *
 * Unlike RichDescriptionEditor this component does NOT handle multilingual
 * JSON locale maps. It works with raw HTML strings directly. Use it wherever
 * the stored value is plain HTML (e.g. email templates).
 */
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import { useEffect, useRef, useCallback } from 'react';
import { Button } from '@heroui/react';
import { Tooltip } from '@heroui/react';
import {
  Bold,
  Italic,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Undo,
  Redo,
  Link as LinkIcon,
  Unlink,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

import './rich-description-editor.css';

export interface RichHtmlEditorProps {
  /** Raw HTML value */
  value: string;
  /** Called on every content change with the resulting HTML string */
  onChange: (html: string) => void;
  /** Optional placeholder text shown when the editor is empty */
  placeholder?: string;
  /** Tailwind class(es) for min-height, e.g. "min-h-48". Defaults to min-h-48 */
  minHeightClass?: string;
}

export function RichHtmlEditor({
  value,
  onChange,
  placeholder,
  minHeightClass = 'min-h-48',
}: RichHtmlEditorProps) {
  const { t } = useTranslation();

  // Refs to keep callbacks stable without re-creating the editor
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: placeholder ?? t('admin-rich-html-editor-placeholder', 'Enter HTML content…'),
      }),
      Link.configure({ openOnClick: false }),
    ],
    content: value,
    onUpdate: ({ editor: e }) => {
      onChangeRef.current(e.getHTML());
    },
  });

  // Sync editor content when `value` prop changes externally (e.g. event switch)
  useEffect(() => {
    if (!editor) return;
    // Only update if the editor's current HTML differs from the new value
    // to avoid cursor jumping on every keystroke
    if (editor.getHTML() !== value) {
      editor.commands.setContent(value);
    }
  }, [editor, value]);

  const handleSetLink = useCallback(() => {
    if (!editor) return;
    const previousUrl = editor.getAttributes('link').href as string | undefined;
    // eslint-disable-next-line no-alert
    const url = window.prompt(t('admin-rich-html-editor-link-prompt', 'URL'), previousUrl ?? 'https://');
    if (url === null) return; // cancelled
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
  }, [editor, t]);

  if (!editor) return null;

  const v = (active: boolean) => (active ? ('primary' as const) : ('tertiary' as const));

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* ── Toolbar ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 p-2 border-b bg-default-50 flex-wrap">
        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant={v(editor.isActive('bold'))}
              onPress={() => editor.chain().focus().toggleBold().run()}
            >
              <Bold size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{t('admin-products-editor-bold')}</Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant={v(editor.isActive('italic'))}
              onPress={() => editor.chain().focus().toggleItalic().run()}
            >
              <Italic size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{t('admin-products-editor-italic')}</Tooltip.Content>
        </Tooltip>

        <div className="w-px h-6 bg-default-200 mx-1" />

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant={v(editor.isActive('heading', { level: 2 }))}
              onPress={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
            >
              <Heading2 size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{t('admin-products-editor-h2')}</Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant={v(editor.isActive('heading', { level: 3 }))}
              onPress={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
            >
              <Heading3 size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{t('admin-products-editor-h3')}</Tooltip.Content>
        </Tooltip>

        <div className="w-px h-6 bg-default-200 mx-1" />

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant={v(editor.isActive('bulletList'))}
              onPress={() => editor.chain().focus().toggleBulletList().run()}
            >
              <List size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{t('admin-products-editor-ul')}</Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant={v(editor.isActive('orderedList'))}
              onPress={() => editor.chain().focus().toggleOrderedList().run()}
            >
              <ListOrdered size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{t('admin-products-editor-ol')}</Tooltip.Content>
        </Tooltip>

        <div className="w-px h-6 bg-default-200 mx-1" />

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant={v(editor.isActive('link'))}
              onPress={handleSetLink}
            >
              <LinkIcon size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{t('admin-rich-html-editor-link', 'Insert link')}</Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              isDisabled={!editor.isActive('link')}
              onPress={() => editor.chain().focus().unsetLink().run()}
            >
              <Unlink size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{t('admin-rich-html-editor-unlink', 'Remove link')}</Tooltip.Content>
        </Tooltip>

        <div className="w-px h-6 bg-default-200 mx-1" />

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              isDisabled={!editor.can().undo()}
              onPress={() => editor.chain().focus().undo().run()}
            >
              <Undo size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{t('admin-products-editor-undo')}</Tooltip.Content>
        </Tooltip>

        <Tooltip>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size="sm"
              variant="tertiary"
              isDisabled={!editor.can().redo()}
              onPress={() => editor.chain().focus().redo().run()}
            >
              <Redo size={14} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>{t('admin-products-editor-redo')}</Tooltip.Content>
        </Tooltip>
      </div>

      {/* ── Content ──────────────────────────────────────────────────── */}
      <div className={`rich-editor-content ${minHeightClass}`}>
        <EditorContent editor={editor} />
      </div>
    </div>
  );
}

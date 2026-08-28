import { generateJSON, generateHTML } from '@tiptap/html';
import StarterKit from '@tiptap/starter-kit';
import { TRACK_CHANGE_MARKS } from '@/extensions/TrackChanges';
import { createClient } from '@supabase/supabase-js';
const sb = createClient(process.env.VITE_SUPABASE_URL!, process.env.SB_KEY!);
const ids=['42add31c-b443-4658-99b3-4baa865eed9f','8d775fec-9e7b-49d7-af95-2db34c8837f2'];
const { data } = await sb.from('card_fields').select('id,content_html').in('id', ids);
for (const r of data!) {
  const ext=[StarterKit as any, ...TRACK_CHANGE_MARKS];
  const out=generateHTML(generateJSON(r.content_html, ext), ext);
  console.log(r.id, 'marksIn', (r.content_html.match(/data-track-insertion/g)||[]).length, 'marksOut', (out.match(/data-track-insertion/g)||[]).length);
}

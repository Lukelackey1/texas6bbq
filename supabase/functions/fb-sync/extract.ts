// Reads a post or flyer image and pulls out menu items and prices with Claude.
// Returns null when the post isn't a price list. Never writes to the menu itself:
// results become suggestions an admin approves in the portal.
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';

export type Item = { name: string; price: number; note: string; category: 'meat' | 'side' };
export type Extracted = { items: Item[]; banner_heading: string; banner_text: string };

const PROMPT = `This is a Facebook post or flyer from Texas 6 BBQ, a family BBQ caterer in Waco, Texas.
If it lists food for sale with prices, record every priced item with the record_menu tool.
- name: the food in Title Case, without the size (e.g. "3LB TURKEY BREAST" becomes "Turkey Breast").
- price: dollars as a number, no symbol.
- note: the size or quantity if given, short and lowercase (e.g. "12–16 lb", "16–20 lb bird", "half pan", "6 quarters"). Empty if none.
- category: "side" for sides, desserts and pans (mac and cheese, beans, potatoes, pudding); "meat" for everything smoked.
- banner_heading: if this is a seasonal or holiday special, a short headline taken from the post (e.g. "It's turkey time!"); otherwise empty.
- banner_text: one or two sentences with ordering or pickup details from the post, written as the business; otherwise empty.
Only include prices that are actually shown. If nothing has a price, set is_price_list to false and leave items empty.`;

const TOOL = {
  name: 'record_menu',
  description: 'Record the priced menu items found in the post.',
  input_schema: {
    type: 'object',
    properties: {
      is_price_list: { type: 'boolean' },
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            price: { type: 'number' },
            note: { type: 'string' },
            category: { type: 'string', enum: ['meat', 'side'] },
          },
          required: ['name', 'price', 'note', 'category'],
        },
      },
      banner_heading: { type: 'string' },
      banner_text: { type: 'string' },
    },
    required: ['is_price_list', 'items', 'banner_heading', 'banner_text'],
  },
};

export class NotConfigured extends Error {}

export async function imageToBase64(url: string): Promise<{ data: string; media_type: string } | null> {
  const r = await fetch(url);
  if (!r.ok) return null;
  const type = (r.headers.get('content-type') ?? 'image/jpeg').split(';')[0];
  if (!/^image\/(jpeg|png|gif|webp)$/.test(type)) return null;
  return { data: encodeBase64(new Uint8Array(await r.arrayBuffer())), media_type: type };
}

export async function extractPrices(
  text: string,
  image: { data: string; media_type: string } | null,
): Promise<Extracted | null> {
  const key = Deno.env.get('ANTHROPIC_API_KEY');
  if (!key) throw new NotConfigured('Price reading isn’t switched on yet. Add an ANTHROPIC_API_KEY secret in Supabase.');
  const content: unknown[] = [];
  if (image) content.push({ type: 'image', source: { type: 'base64', media_type: image.media_type, data: image.data } });
  content.push({ type: 'text', text: `${PROMPT}\n\nPost text:\n${text || '(no text, image only)'}` });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
    body: JSON.stringify({
      model: Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-sonnet-5-5',
      max_tokens: 1500,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: 'record_menu' },
      messages: [{ role: 'user', content }],
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`The price reader returned an error: ${body?.error?.message ?? res.status}`);
  const use = (body.content ?? []).find((c: { type: string }) => c.type === 'tool_use');
  const out = use?.input;
  if (!out?.is_price_list || !Array.isArray(out.items) || !out.items.length) return null;
  const items: Item[] = out.items
    .filter((i: Item) => i && i.name && Number.isFinite(Number(i.price)))
    .map((i: Item) => ({
      name: String(i.name).trim(),
      price: Math.round(Number(i.price) * 100) / 100,
      note: String(i.note ?? '').trim(),
      category: i.category === 'side' ? 'side' : 'meat',
    }));
  return items.length ? { items, banner_heading: out.banner_heading ?? '', banner_text: out.banner_text ?? '' } : null;
}

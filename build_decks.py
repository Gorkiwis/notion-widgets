import json, os, re, sys
import genanki

STEP_FILE = '/home/gorkaobiang/.gemini/antigravity/brain/cc729994-8276-4424-8fdb-b653fd5fd659/.system_generated/steps/2912/output.txt'
BASE_DIR = '/home/gorkaobiang/.gemini/antigravity/scratch/notion-widgets'
MEDIA_DIR = os.path.join(BASE_DIR, 'anki_media')

with open(STEP_FILE, 'r', encoding='utf-8') as f:
    data = json.load(f)

results = data.get('results', [])

valid_cards = []
for p in results:
    page_id = p.get('id')
    props = p.get('properties') or {}
    
    name_prop = props.get('Name') or props.get('Question') or props.get('Pregunta') or props.get('Título') or {}
    title = ''.join([t.get('plain_text', '') for t in name_prop.get('title', [])]).strip()
    if not title:
        continue
        
    c_sel = (props.get('Course') or {}).get('select') or {}
    course = c_sel.get('name', 'General')
    
    t_sel = (props.get('Tema') or {}).get('select') or {}
    tema = t_sel.get('name', 'UD1')
    
    ans = ''.join([x.get('plain_text', '') for x in (props.get('Answer') or {}).get('rich_text', [])]).strip()
    mi_ans = ''.join([x.get('plain_text', '') for x in (props.get('Mi respuesta') or {}).get('rich_text', [])]).strip()
    if not ans and mi_ans:
        ans = mi_ans
        
    status = ((props.get('Status') or {}).get('select') or {}).get('name', 'To Learn')
    plantilla = ((props.get('Plantilla') or {}).get('select') or {}).get('name', 'Estándar')
    
    # Check local image
    local_img_name = f"notion_{page_id}.png"
    local_img_path = os.path.join(MEDIA_DIR, local_img_name)
    has_image = os.path.exists(local_img_path)
    
    card_obj = {
        'id': page_id,
        'course': course,
        'tema': tema,
        'question': title,
        'answer': ans,
        'status': status,
        'plantilla': plantilla,
        'image': f"anki_media/{local_img_name}" if has_image else "",
        'image_filename': local_img_name if has_image else ""
    }
    valid_cards.append(card_obj)

print(f"Total valid cards processed: {len(valid_cards)}")

# Save flashcards_data.json
json_out = os.path.join(BASE_DIR, 'flashcards_data.json')
with open(json_out, 'w', encoding='utf-8') as f:
    json.dump({'updated_at': '2026-10-18T13:00:00Z', 'total': len(valid_cards), 'cards': valid_cards}, f, indent=2, ensure_ascii=False)
print(f"Wrote {json_out}")

# Define Anki Models
CSS = """
.card {
 font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
 font-size: 19px;
 text-align: center;
 color: #f1f5f9;
 background-color: #1e1e24;
 padding: 25px;
}
.badge-deck {
 display: inline-block;
 font-size: 11px;
 font-weight: 700;
 text-transform: uppercase;
 letter-spacing: 0.05em;
 background: #3b82f6;
 color: #ffffff;
 padding: 3px 10px;
 border-radius: 9999px;
 margin-bottom: 16px;
}
.question {
 font-weight: 600;
 margin-bottom: 20px;
 line-height: 1.4;
}
.answer {
 color: #38bdf8;
 font-weight: 500;
 margin-top: 15px;
 border-top: 1px solid #334155;
 padding-top: 15px;
}
img {
 max-width: 90%;
 max-height: 280px;
 border-radius: 8px;
 margin: 12px auto;
 display: block;
 box-shadow: 0 4px 12px rgba(0,0,0,0.5);
}
input#typeans {
 font-size: 17px;
 padding: 6px 12px;
 border-radius: 6px;
 border: 2px solid #38bdf8;
 background: #0f172a;
 color: #f8fafc;
 text-align: center;
 width: 80%;
 margin: 10px auto;
}
"""

standard_model = genanki.Model(
    1607392319,
    'Notion Standard FP',
    fields=[{'name': 'Deck'}, {'name': 'Front'}, {'name': 'Back'}, {'name': 'Image'}],
    templates=[{
        'name': 'Standard Card',
        'qfmt': '<div class="badge-deck">{{Deck}}</div><div class="question">{{Front}}</div>{{#Image}}<div><img src="{{Image}}"></div>{{/Image}}',
        'afmt': '{{FrontSide}}<hr id="answer"><div class="answer">{{Back}}</div>'
    }],
    css=CSS
)

typein_model = genanki.Model(
    1607392320,
    'Notion TypeIn FP',
    fields=[{'name': 'Deck'}, {'name': 'Front'}, {'name': 'Back'}, {'name': 'Image'}],
    templates=[{
        'name': 'TypeIn Card',
        'qfmt': '<div class="badge-deck">{{Deck}}</div><div class="question">{{Front}}</div>{{#Image}}<div><img src="{{Image}}"></div>{{/Image}}<div style="margin-top:10px;">{{type:Back}}</div>',
        'afmt': '<div class="badge-deck">{{Deck}}</div><div class="question">{{Front}}</div>{{#Image}}<div><img src="{{Image}}"></div>{{/Image}}<hr id="answer"><div style="margin-top:10px;">{{type:Back}}</div>'
    }],
    css=CSS
)

def create_note(c):
    deck_name = f"{c['course']}::{c['tema']}"
    is_typein = 'Plantilla 1' in (c['plantilla'] or '')
    model = typein_model if is_typein else standard_model
    img_field = c['image_filename'] if c['image_filename'] else ''
    return genanki.Note(
        model=model,
        fields=[deck_name, c['question'], c['answer'], img_field],
        guid=genanki.guid_for(c['id'])
    )

# 1. Deck Procesamiento UD1
deck_proc = genanki.Deck(2059400101, 'Procesamiento citológico y tisular::UD1')
media_proc = []
for c in valid_cards:
    if c['course'] == 'Procesamiento citológico y tisular' and c['tema'] == 'UD1':
        deck_proc.add_note(create_note(c))
        if c['image_filename']:
            media_proc.append(os.path.join(MEDIA_DIR, c['image_filename']))

pkg_proc = genanki.Package(deck_proc)
pkg_proc.media_files = media_proc
pkg_proc.write_to_file(os.path.join(BASE_DIR, 'Procesamiento_UD1.apkg'))
print(f"Generated Procesamiento_UD1.apkg with {len(deck_proc.notes)} notes")

# 2. Deck Fisiopatologia UD2
deck_fisio = genanki.Deck(2059400102, 'Fisiopatología General::UD2')
media_fisio = []
for c in valid_cards:
    if c['course'] == 'Fisiopatología General' and c['tema'] == 'UD2':
        deck_fisio.add_note(create_note(c))
        if c['image_filename']:
            media_fisio.append(os.path.join(MEDIA_DIR, c['image_filename']))

pkg_fisio = genanki.Package(deck_fisio)
pkg_fisio.media_files = media_fisio
pkg_fisio.write_to_file(os.path.join(BASE_DIR, 'Fisiopatologia_UD2.apkg'))
print(f"Generated Fisiopatologia_UD2.apkg with {len(deck_fisio.notes)} notes")

# 3. Master Deck Completo (Contains both decks)
pkg_master = genanki.Package([deck_proc, deck_fisio])
all_media = list(set(media_proc + media_fisio))
pkg_master.media_files = all_media
pkg_master.write_to_file(os.path.join(BASE_DIR, 'Anki_Flashcards_Completo.apkg'))
print(f"Generated Anki_Flashcards_Completo.apkg with {len(deck_proc.notes) + len(deck_fisio.notes)} notes")


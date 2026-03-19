// ── PDF.js setup ──
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

// ── COCKTAIL OPTIONS ──
const COCKTAILS = [
  "Navette moelleuse au saumon, fromage frais citronné",
  "Risotto crémeux aux crevettes",
  "Tataki de thon, sésame & sauce teriyaki",
  "Croque doré au jambon et fromage",
  "Toast de Serrano, comté affiné & éclats de noisette",
  "Wrap à l'effiloché de porcelet confit",
  "Velouté de saison, servi chaud",
  "Gaufre de pomme de terre, crème forestière au parmesan"
];

// ── API KEY MANAGEMENT ──
function getApiKey() { return localStorage.getItem('msc_api_key') || ''; }
function saveApiKey() {
  const key = document.getElementById('apiKeyInput').value.trim();
  if (!key.startsWith('sk-ant-')) {
    alert('La clé API doit commencer par sk-ant-…\nVérifiez sur console.anthropic.com');
    return;
  }
  localStorage.setItem('msc_api_key', key);
  document.getElementById('apiModal').classList.add('hidden');
}
function openSettings() {
  document.getElementById('apiKeyInput').value = getApiKey();
  document.getElementById('apiModal').classList.remove('hidden');
}

// ── INIT ──
window.addEventListener('load', () => {
  if (!getApiKey()) {
    document.getElementById('apiModal').classList.remove('hidden');
  }
  buildCocktailList();
});

// ── COCKTAIL LIST ──
function buildCocktailList(selected = []) {
  const list = document.getElementById('cocktailList');
  list.innerHTML = '';
  COCKTAILS.forEach((c, i) => {
    const isSelected = selected.some(s => s && c.toLowerCase().includes(s.toLowerCase().slice(0, 12)));
    const label = document.createElement('label');
    label.className = 'cocktail-item' + (isSelected ? ' selected' : '');
    label.innerHTML = `<input type="checkbox" ${isSelected ? 'checked' : ''}>  ${i + 1}. ${c}`;
    label.querySelector('input').addEventListener('change', function () {
      label.classList.toggle('selected', this.checked);
    });
    list.appendChild(label);
  });
}

// ── UPLOAD ──
const fileInput = document.getElementById('fileInput');
const uploadZone = document.getElementById('uploadZone');

uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('drag-over'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('drag-over'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('drag-over');
  const file = e.dataTransfer.files[0];
  if (file && file.type === 'application/pdf') processPDF(file);
  else alert('Veuillez sélectionner un fichier PDF.');
});
fileInput.addEventListener('change', e => {
  if (e.target.files[0]) processPDF(e.target.files[0]);
});

function showStatus(text) {
  const bar = document.getElementById('statusBar');
  bar.classList.remove('hidden');
  document.getElementById('statusText').textContent = text;
}
function hideStatus() {
  document.getElementById('statusBar').classList.add('hidden');
}

// ── PDF PROCESSING ──
async function processPDF(file) {
  const apiKey = getApiKey();
  if (!apiKey) {
    document.getElementById('apiModal').classList.remove('hidden');
    return;
  }

  showStatus('Lecture du PDF…');
  try {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      fullText += content.items.map(item => item.str).join(' ') + '\n';
    }
    showStatus('Analyse IA de la facture en cours…');
    await analyseWithClaude(fullText, file.name, apiKey);
  } catch (err) {
    hideStatus();
    alert('Erreur lors de la lecture du PDF :\n' + err.message);
  }
}

// ── CLAUDE API ──
async function analyseWithClaude(text, filename, apiKey) {
  const prompt = `Tu es un assistant spécialisé dans l'analyse de factures du traiteur Marc Sainte-Claire. Analyse ce texte de facture et extrais toutes les informations disponibles.

TEXTE DE LA FACTURE :
---
${text}
---

Réponds UNIQUEMENT avec un objet JSON valide (pas de markdown, pas de texte avant ou après) :

{
  "invoice_ref": "numéro de facture",
  "client": "nom complet du client ou organisation",
  "date_prestation": "date de l'événement (pas la date de facture)",
  "lieu": "lieu/ville de la prestation",
  "adultes_repas": "nombre de convives adultes pour le repas (cherche la quantité principale)",
  "adultes_vinh": "nombre adultes vin d'honneur si différent, sinon même valeur",
  "enfants_repas": "nombre enfants si mentionné",
  "cocktails": ["liste des noms de cocktails mentionnés, ou [] si non précisé"],
  "entree": "entrée du dîner",
  "plat": "plat principal",
  "accompagnement": "accompagnement du plat",
  "fromage": "fromage si mentionné",
  "dessert": "dessert",
  "cafe": "Inclus si le café est mentionné, sinon vide",
  "pain": "Inclus si le pain est mentionné, sinon vide",
  "service_inclus": "Oui ou Non selon la facture (cherche 'service' dans inclus)",
  "vaisselle_inclus": "Oui ou Non",
  "nappage_inclus": "Oui ou Non (cherche si nappage est facturé comme prestation séparée = Oui)",
  "mobilier_inclus": "Oui ou Non (mobilier non compris = Non)",
  "boissons_info": "info sur les boissons (soft, alcool, compris ou non)",
  "commentaires": "informations utiles : transport, conditions particulières, allergies, remarques"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-calls': 'true'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages: [{ role: 'user', content: prompt }]
      })
    });

    if (!response.ok) {
      const err = await response.json();
      if (response.status === 401) {
        hideStatus();
        alert('Clé API invalide. Vérifiez votre clé dans les paramètres (⚙️).');
        openSettings();
        return;
      }
      throw new Error(err.error?.message || `Erreur API (${response.status})`);
    }

    const data = await response.json();
    const raw = data.content.map(i => i.text || '').join('');
    const clean = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);
    fillFiche(parsed, filename);
    hideStatus();

  } catch (err) {
    hideStatus();
    alert('Erreur lors de l\'analyse :\n' + err.message);
  }
}

// ── FILL FICHE ──
function fillFiche(data, filename) {
  set('f_client', data.client);
  set('f_date', data.date_prestation);
  set('f_lieu', data.lieu);
  set('f_adultes_repas', data.adultes_repas);
  set('f_adultes_vinh', data.adultes_vinh || data.adultes_repas);
  set('f_enfants_repas', data.enfants_repas);
  set('f_entree', data.entree);
  set('f_plat', data.plat);
  set('f_accompagnement', data.accompagnement);
  set('f_fromage', data.fromage);
  set('f_dessert', data.dessert);
  set('f_cafe', data.cafe);
  set('f_pain', data.pain);

  // Boissons info → commentaires si non vide
  let commentaires = data.commentaires || '';
  if (data.boissons_info) commentaires = (commentaires ? commentaires + '\n\n' : '') + 'Boissons : ' + data.boissons_info;
  set('f_commentaires', commentaires);

  setLog('service', data.service_inclus);
  setLog('vaisselle', data.vaisselle_inclus);
  setLog('nappage', data.nappage_inclus);
  setLog('mobilier', data.mobilier_inclus);

  buildCocktailList(data.cocktails || []);

  document.getElementById('invoiceRef').textContent = `Facture ${data.invoice_ref || filename}`;
  document.getElementById('dateGenerated').textContent = `Fiche générée le ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`;

  document.getElementById('uploadZone').classList.add('hidden');
  document.getElementById('fiche').classList.remove('hidden');
  document.getElementById('fiche').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function set(id, value) {
  const el = document.getElementById(id);
  if (el && value !== undefined && value !== null) el.value = value;
}

function setLog(name, value) {
  const normalized = value === 'oui' ? 'Oui' : value === 'non' ? 'Non' : value;
  const select = document.getElementById('f_' + name);
  if (select && normalized) select.value = normalized;
  updateLogStyle(name);
}

function updateLogStyle(name) {
  const select = document.getElementById('f_' + name);
  const wrap = document.getElementById('wrap_' + name);
  if (!select || !wrap) return;
  wrap.classList.remove('yes', 'no');
  if (select.value === 'Oui') wrap.classList.add('yes');
  else if (select.value === 'Non') wrap.classList.add('no');
}

// ── RESET ──
function resetAll() {
  document.getElementById('fiche').classList.add('hidden');
  document.getElementById('uploadZone').classList.remove('hidden');
  document.getElementById('fileInput').value = '';
  buildCocktailList();
  ['f_client','f_date','f_lieu','f_accueillant','f_tel',
   'f_cuisine_arrivee','f_service_arrivee','f_invites_arrivee','f_ceremonie',
   'f_h_vinh','f_h_entree','f_h_plat','f_h_fromage','f_h_dessert',
   'f_adultes_vinh','f_adultes_repas','f_adultes_vege',
   'f_enfants_vinh','f_enfants_repas','f_enfants_vege',
   'f_b_vinh','f_b_repas','f_b_dessert',
   'f_ateliers','f_entree','f_plat','f_accompagnement',
   'f_fromage','f_dessert','f_cafe','f_pain',
   'f_enf_entree','f_enf_plat','f_enf_dessert',
   'f_nuit','f_lendemain','f_commentaires'
  ].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['service','vaisselle','nappage','mobilier'].forEach(name => {
    const s = document.getElementById('f_' + name);
    if (s) s.value = '';
    updateLogStyle(name);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ── CSV EXPORT ──
function downloadCSV() {
  const cocktailsChecked = [...document.querySelectorAll('#cocktailList input:checked')]
    .map(cb => cb.parentElement.textContent.trim()).join(' | ');

  const rows = [
    ['FICHE CONTACT CLIENT – PRESTATION MSC'],
    ['Référence', document.getElementById('invoiceRef').textContent],
    [''],
    ['=== COORDONNÉES ==='],
    ['Client', val('f_client')],
    ['Date prestation', val('f_date')],
    ['Lieu', val('f_lieu')],
    ['Accueillant', val('f_accueillant')],
    ['Téléphone', val('f_tel')],
    [''],
    ['=== HORAIRES ==='],
    ['Cuisine – Arrivée', val('f_cuisine_arrivee')],
    ['Service – Arrivée', val('f_service_arrivee')],
    ['Invités – Arrivée', val('f_invites_arrivee')],
    ['Cérémonie laïque', val('f_ceremonie')],
    ['Vin d\'honneur', val('f_h_vinh')],
    ['Entrée', val('f_h_entree')],
    ['Plat', val('f_h_plat')],
    ['Fromage', val('f_h_fromage')],
    ['Dessert', val('f_h_dessert')],
    [''],
    ['=== CONVIVES ==='],
    ['Adultes – Vin d\'honneur', val('f_adultes_vinh')],
    ['Adultes – Repas', val('f_adultes_repas')],
    ['Adultes – Végé/Végan', val('f_adultes_vege')],
    ['Enfants – Vin d\'honneur', val('f_enfants_vinh')],
    ['Enfants – Repas', val('f_enfants_repas')],
    [''],
    ['=== MENU ADULTE ==='],
    ['Cocktail sélectionné', cocktailsChecked],
    ['Entrée / Mise en bouche', val('f_entree')],
    ['Le plat', val('f_plat')],
    ['Accompagnement', val('f_accompagnement')],
    ['Le fromage', val('f_fromage')],
    ['Le dessert', val('f_dessert')],
    ['Le café', val('f_cafe')],
    ['Le pain', val('f_pain')],
    [''],
    ['=== LOGISTIQUE ==='],
    ['Service', val('f_service')],
    ['Mobilier', val('f_mobilier')],
    ['Vaisselle', val('f_vaisselle')],
    ['Nappage', val('f_nappage')],
    [''],
    ['=== MENU ENFANT ==='],
    ['Entrée', val('f_enf_entree')],
    ['Plat', val('f_enf_plat')],
    ['Dessert', val('f_enf_dessert')],
    [''],
    ['=== COMMENTAIRES ==='],
    [val('f_commentaires')],
  ];

  const csv = rows.map(r => r.map(c => `"${(c || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const client = val('f_client').replace(/\s+/g, '_').slice(0, 30);
  const date = val('f_date').replace(/\//g, '-').slice(0, 10);
  a.download = `Fiche_Prestation_${client || 'MSC'}_${date || new Date().toLocaleDateString('fr-FR')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function val(id) {
  const el = document.getElementById(id);
  return el ? el.value : '';
}

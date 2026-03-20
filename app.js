// Configuration
const CONFIG = {
    API_PROVIDER: 'openai',
    OPENAI_MODEL: 'gpt-4o-mini',  // Modèle économique et rapide
    API_KEY_STORAGE: 'fiche_prestation_api_key',
    API_URL: 'https://api.openai.com/v1/chat/completions'
};

// Variables globales
let apiKey = localStorage.getItem(CONFIG.API_KEY_STORAGE) || '';
let extractedText = '';

// Initialisation
document.addEventListener('DOMContentLoaded', () => {
    initializeUI();
    checkApiKey();
});

function initializeUI() {
    // Zone de drop
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-input');

    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    // Boutons
    document.getElementById('btn-imprimer').addEventListener('click', imprimerFiche);
    document.getElementById('btn-telecharger').addEventListener('click', telechargerCSV);
    document.getElementById('btn-nouveau').addEventListener('click', nouveauDocument);

    // Paramètres
    document.getElementById('btn-settings').addEventListener('click', openSettings);
    document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
    document.getElementById('btn-save-key').addEventListener('click', saveApiKey);
    document.getElementById('btn-clear-key').addEventListener('click', clearApiKey);

    // Checkbox "Tout cocher" pour cocktail
    document.getElementById('cocktail-tout').addEventListener('change', function() {
        const checkboxes = document.querySelectorAll('.cocktail-item input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = this.checked);
    });
}

function checkApiKey() {
    apiKey = localStorage.getItem(CONFIG.API_KEY_STORAGE);
    if (!apiKey) {
        openSettings();
    } else {
        document.getElementById('api-status').textContent = '✓ Clé API configurée';
        document.getElementById('api-status').style.color = '#4CAF50';
    }
}

function openSettings() {
    document.getElementById('settings-modal').style.display = 'block';
    const storedKey = localStorage.getItem(CONFIG.API_KEY_STORAGE);
    if (storedKey) {
        document.getElementById('api-key-input').value = storedKey;
    }
}

function closeSettings() {
    document.getElementById('settings-modal').style.display = 'none';
}

function saveApiKey() {
    const key = document.getElementById('api-key-input').value.trim();
    if (key && key.startsWith('sk-')) {
        localStorage.setItem(CONFIG.API_KEY_STORAGE, key);
        apiKey = key;
        document.getElementById('api-status').textContent = '✓ Clé API configurée';
        document.getElementById('api-status').style.color = '#4CAF50';
        closeSettings();
        alert('Clé API OpenAI enregistrée avec succès !');
    } else {
        alert('Veuillez entrer une clé API OpenAI valide (commençant par sk-)');
    }
}

function clearApiKey() {
    localStorage.removeItem(CONFIG.API_KEY_STORAGE);
    apiKey = '';
    document.getElementById('api-key-input').value = '';
    document.getElementById('api-status').textContent = '✗ Aucune clé API';
    document.getElementById('api-status').style.color = '#f44336';
    alert('Clé API supprimée');
}

async function handleFile(file) {
    if (!apiKey) {
        alert('Veuillez d\'abord configurer votre clé API OpenAI (cliquez sur ⚙️)');
        openSettings();
        return;
    }

    if (file.type !== 'application/pdf' && !file.name.endsWith('.pdf')) {
        alert('Veuillez sélectionner un fichier PDF');
        return;
    }

    showLoading('Lecture du PDF en cours...');

    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({data: arrayBuffer}).promise;

        let fullText = '';
        const numPages = Math.min(pdf.numPages, 3); // Limiter à 3 pages pour économiser les tokens

        for (let i = 1; i <= numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            fullText += pageText + '\n';
        }

        extractedText = fullText.substring(0, 8000); // Limiter la taille

        showLoading('Analyse IA de la facture en cours...');
        await analyzeWithOpenAI(extractedText);

    } catch (error) {
        console.error('Erreur:', error);
        hideLoading();
        alert('Erreur lors de la lecture du PDF: ' + error.message);
    }
}

async function analyzeWithOpenAI(text) {
    try {
        const prompt = `Tu es un assistant spécialisé dans l\'analyse de factures de traiteur. 

Analyse ce texte de facture et extrais les informations suivantes au format JSON strict:

{
  "client": {
    "nom": "Nom du client",
    "prenom": "Prénom du client",
    "telephone": "Téléphone",
    "email": "Email"
  },
  "prestation": {
    "date": "Date de la prestation (JJ/MM/AAAA)",
    "heure": "Heure de la prestation",
    "lieu": "Lieu/adresse de la prestation",
    "type": "Type d\'événement",
    "nombre_convives": "Nombre de convives (nombre)",
    "nombre_adultes": "Nombre d\'adultes",
    "nombre_enfants": "Nombre d\'enfants"
  },
  "menu": {
    "cocktail": ["liste des pièces cocktail sélectionnées"],
    "entree": "Description de l\'entrée",
    "plat": "Description du plat principal",
    "fromage": "Description du fromage ou non",
    "dessert": "Description du dessert",
    "cafe": "Oui ou Non"
  },
  "logistique": {
    "service": true/false,
    "vaisselle": true/false,
    "nappage": true/false,
    "mobilier": true/false,
    "boissons": "Description des boissons"
  },
  "commentaires": "Commentaires importants, restrictions alimentaires, etc."
}

Texte de la facture à analyser:
${text}

Réponds UNIQUEMENT avec le JSON valide, sans texte avant ou après.`;

        const response = await fetch(CONFIG.API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
            },
            body: JSON.stringify({
                model: CONFIG.OPENAI_MODEL,
                messages: [
                    {
                        role: 'system',
                        content: 'Tu es un assistant qui analyse des factures de traiteur et retourne uniquement des données JSON structurées.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                temperature: 0.1,
                max_tokens: 2000
            })
        });

        // DEBUG: Afficher le statut de la réponse
        console.log('Status:', response.status);
        console.log('Status Text:', response.statusText);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Error data:', errorData);

            if (response.status === 401) {
                throw new Error('Clé API invalide ou expirée. Vérifiez votre clé sur platform.openai.com');
            } else if (response.status === 429) {
                throw new Error('Quota dépassé. Vérifiez votre solde sur platform.openai.com');
            } else if (response.status === 400) {
                throw new Error(`Erreur de requête: ${errorData.error?.message || 'Format incorrect'}`);
            } else {
                throw new Error(`Erreur API OpenAI: ${response.status} - ${errorData.error?.message || response.statusText}`);
            }
        }

        const data = await response.json();

        // DEBUG: Afficher la réponse brute
        console.log('OpenAI response:', data);

        if (!data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error('Réponse OpenAI invalide: structure inattendue');
        }

        const content = data.choices[0].message.content;

        // Extraire le JSON de la réponse
        let jsonStr = content;

        // Si le JSON est dans un bloc de code markdown
        const jsonMatch = content.match(/```json\s*([\s\S]*?)```/);
        if (jsonMatch) {
            jsonStr = jsonMatch[1];
        } else {
            // Chercher le début et fin du JSON
            const startIdx = content.indexOf('{');
            const endIdx = content.lastIndexOf('}');
            if (startIdx !== -1 && endIdx !== -1) {
                jsonStr = content.substring(startIdx, endIdx + 1);
            }
        }

        // DEBUG: Afficher le JSON extrait
        console.log('JSON extrait:', jsonStr);

        const extractedData = JSON.parse(jsonStr);
        fillForm(extractedData);
        hideLoading();

    } catch (error) {
        console.error('Erreur OpenAI:', error);
        hideLoading();

        // Message d'erreur détaillé
        let errorMsg = error.message;
        if (error.message.includes('Clé API invalide')) {
            errorMsg += '\n\nVotre clé commence par: ' + apiKey.substring(0, 10) + '...\nVérifiez sur platform.openai.com/api-keys';
        }

        alert('Erreur: ' + errorMsg);
    }
}

function fillForm(data) {
    // Client
    if (data.client) {
        document.getElementById('client-nom').value = data.client.nom || '';
        document.getElementById('client-prenom').value = data.client.prenom || '';
        document.getElementById('client-tel').value = data.client.telephone || '';
        document.getElementById('client-email').value = data.client.email || '';
    }

    // Prestation
    if (data.prestation) {
        document.getElementById('event-date').value = formatDateForInput(data.prestation.date);
        document.getElementById('event-heure').value = data.prestation.heure || '';
        document.getElementById('event-lieu').value = data.prestation.lieu || '';
        document.getElementById('event-type').value = data.prestation.type || '';
        document.getElementById('nb-convives').value = data.prestation.nombre_convives || '';
        document.getElementById('nb-adultes').value = data.prestation.nombre_adultes || '';
        document.getElementById('nb-enfants').value = data.prestation.nombre_enfants || '';
    }

    // Menu - Cocktail
    if (data.menu && data.menu.cocktail) {
        const cocktailItems = data.menu.cocktail;
        const checkboxes = document.querySelectorAll('.cocktail-item input[type="checkbox"]');

        checkboxes.forEach(cb => {
            const itemName = cb.getAttribute('data-item');
            cb.checked = cocktailItems.some(item => 
                item.toLowerCase().includes(itemName.toLowerCase()) || 
                itemName.toLowerCase().includes(item.toLowerCase())
            );
        });
    }

    // Menu - Repas
    if (data.menu) {
        document.getElementById('menu-entree').value = data.menu.entree || '';
        document.getElementById('menu-plat').value = data.menu.plat || '';
        document.getElementById('menu-fromage').value = data.menu.fromage || '';
        document.getElementById('menu-dessert').value = data.menu.dessert || '';
        document.getElementById('menu-cafe').value = data.menu.cafe || 'Non';
    }

    // Logistique
    if (data.logistique) {
        document.getElementById('log-service').checked = data.logistique.service || false;
        document.getElementById('log-vaisselle').checked = data.logistique.vaisselle || false;
        document.getElementById('log-nappage').checked = data.logistique.nappage || false;
        document.getElementById('log-mobilier').checked = data.logistique.mobilier || false;
        document.getElementById('log-boissons').value = data.logistique.boissons || '';
    }

    // Commentaires
    if (data.commentaires) {
        document.getElementById('commentaires').value = data.commentaires;
    }

    // Afficher un message de succès
    showNotification('Fiche prestation remplie avec succès !');
}

function formatDateForInput(dateStr) {
    if (!dateStr) return '';
    // Convertir JJ/MM/AAAA en AAAA-MM-JJ pour l'input date
    const match = dateStr.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (match) {
        return `${match[3]}-${match[2]}-${match[1]}`;
    }
    return dateStr;
}

function showLoading(message) {
    document.getElementById('loading-text').textContent = message;
    document.getElementById('loading').style.display = 'flex';
}

function hideLoading() {
    document.getElementById('loading').style.display = 'none';
}

function showNotification(message) {
    const notif = document.getElementById('notification');
    notif.textContent = message;
    notif.style.display = 'block';
    setTimeout(() => {
        notif.style.display = 'none';
    }, 3000);
}

function imprimerFiche() {
    window.print();
}

function telechargerCSV() {
    const formData = collectFormData();
    let csv = 'Champ,Valeur\n';

    for (const [key, value] of Object.entries(formData)) {
        csv += `"${key}","${value}"\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `fiche_prestation_${new Date().toISOString().slice(0,10)}.csv`;
    link.click();
}

function collectFormData() {
    const cocktailItems = [];
    document.querySelectorAll('.cocktail-item input[type="checkbox"]:checked').forEach(cb => {
        cocktailItems.push(cb.getAttribute('data-item'));
    });

    return {
        'Nom Client': document.getElementById('client-nom').value,
        'Prénom Client': document.getElementById('client-prenom').value,
        'Téléphone': document.getElementById('client-tel').value,
        'Email': document.getElementById('client-email').value,
        'Date Événement': document.getElementById('event-date').value,
        'Heure': document.getElementById('event-heure').value,
        'Lieu': document.getElementById('event-lieu').value,
        'Type Événement': document.getElementById('event-type').value,
        'Nombre Convives': document.getElementById('nb-convives').value,
        'Nombre Adultes': document.getElementById('nb-adultes').value,
        'Nombre Enfants': document.getElementById('nb-enfants').value,
        'Pièces Cocktail': cocktailItems.join(', '),
        'Entrée': document.getElementById('menu-entree').value,
        'Plat': document.getElementById('menu-plat').value,
        'Fromage': document.getElementById('menu-fromage').value,
        'Dessert': document.getElementById('menu-dessert').value,
        'Café': document.getElementById('menu-cafe').value,
        'Service': document.getElementById('log-service').checked ? 'Oui' : 'Non',
        'Vaisselle': document.getElementById('log-vaisselle').checked ? 'Oui' : 'Non',
        'Nappage': document.getElementById('log-nappage').checked ? 'Oui' : 'Non',
        'Mobilier': document.getElementById('log-mobilier').checked ? 'Oui' : 'Non',
        'Boissons': document.getElementById('log-boissons').value,
        'Commentaires': document.getElementById('commentaires').value
    };
}

function nouveauDocument() {
    if (confirm('Voulez-vous vraiment effacer toutes les données et créer une nouvelle fiche ?')) {
        document.querySelectorAll('input, textarea, select').forEach(field => {
            if (field.type === 'checkbox') {
                field.checked = false;
            } else {
                field.value = '';
            }
        });
        document.getElementById('menu-cafe').value = 'Non';
    }
}

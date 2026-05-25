/* ========================================== */
/* 1. INITIALISATION ET VARIABLES GLOBALES    */
/* ========================================== */

const RATIOS = [100, 90, 80, 70, 60, 50, 40, 30, 20, 10, 0];

// Densités pour le calcul au gramme (g/ml)
const DENSITY_PG = 1.036;
const DENSITY_VG = 1.261;

// État de l'interface (gère les toggles de volume et de nicotine)
let state = {
    t1: { vol_mode: 'defined', nic_mode: 'mg' },
    t2: { vol_mode: 'defined' }
};

// Variables pour la calculatrice intégrée
let calcExpr = "";

// Flag pour vider le nom d'export seulement s'il y a de nouveaux calculs
let pendingNewRecipe = false; 

// État et chemin du Mode Assistant (Wizard)
const WIZ_PATH_MAIN = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'];
const ALL_WIZ_STEPS = ['s0', 's1', 's2', 's3', 's4', 's5', 's6', 's7'];
let wizState = {
    step: 0,
    path: WIZ_PATH_MAIN,
    type: 't1', 
    volMode: 'defined'
};

/* ========================================== */
/* EASTER EGG / PRO MODE AGENT 007         */
/* ========================================== */
let agentIdentity = localStorage.getItem('agentIdentity') || "";
let logoClicks = 0;
let firstClickTime = 0;
let eeInput = "";
let eeTimer = null;

// Check if pro mode was already activated
if (agentIdentity) {
    document.getElementById('btn_pro_mode').classList.remove('hidden');
}

function handleLogoClick() {
    if (agentIdentity) return; // Si identité enregistrée, ça ne fait plus rien

    let now = Date.now();
    if (now - firstClickTime > 2000) {
        logoClicks = 1;
        firstClickTime = now;
    } else {
        logoClicks++;
        if (logoClicks >= 7) {
            openEasterEgg();
            logoClicks = 0;
        }
    }
}

function openEasterEgg() {
    eeInput = "";
    document.getElementById('ee_display').innerText = "";
    document.getElementById('ee_msg').innerText = "Bienvenue Monsieur Bond, entrez votre code secret !";
    document.getElementById('ee_msg').classList.remove('text-red-500', 'animate-pulse-fast');
    document.getElementById('ee_msg').classList.add('text-green-500');
    
    document.querySelectorAll('.ee-btn').forEach(btn => btn.disabled = false);
    
    if (eeTimer) clearInterval(eeTimer);
    document.getElementById('easter_egg_modal').classList.remove('hidden');
}

function eePress(num) {
    if (eeInput.length >= 3 || eeTimer) return;
    eeInput += num;
    document.getElementById('ee_display').innerText = '*'.repeat(eeInput.length);
    
    if (eeInput.length === 3) {
        setTimeout(checkEeCode, 200);
    }
}

function checkEeCode() {
    if (eeInput === "007") {
        document.getElementById('easter_egg_modal').classList.add('hidden');
        document.getElementById('btn_pro_mode').classList.remove('hidden');
        openIdentityModal();
    } else {
        startSelfDestruct();
    }
}

function startSelfDestruct() {
    document.querySelectorAll('.ee-btn').forEach(btn => btn.disabled = true);
    let msgEl = document.getElementById('ee_msg');
    msgEl.innerText = "Cet appareil va s'auto détruire dans 10 secondes!";
    msgEl.classList.remove('text-green-500');
    msgEl.classList.add('text-red-500', 'animate-pulse-fast');
    
    let timeLeft = 10;
    document.getElementById('ee_display').innerText = timeLeft;
    
    eeTimer = setInterval(() => {
        timeLeft--;
        if (timeLeft >= 0) {
            document.getElementById('ee_display').innerText = timeLeft;
        } else {
            clearInterval(eeTimer);
            eeTimer = null;
            document.getElementById('easter_egg_modal').classList.add('hidden');
        }
    }, 1000);
}

function openIdentityModal() {
    document.getElementById('agent_identity_input').value = agentIdentity;
    document.getElementById('agent_identity_modal').classList.remove('hidden');
}

function closeIdentityModal() {
    document.getElementById('agent_identity_modal').classList.add('hidden');
}

function saveIdentity() {
    agentIdentity = document.getElementById('agent_identity_input').value.trim();
    if (agentIdentity) {
        localStorage.setItem('agentIdentity', agentIdentity);
    } else {
        localStorage.removeItem('agentIdentity');
    }
    closeIdentityModal();
}

// Blocage agressif du "pull-to-refresh" sur mobile sauf si on scroll
let startY = 0;
let isSlider = false;

document.addEventListener('touchstart', e => { 
    startY = e.touches[0].pageY; 
    isSlider = e.target && e.target.tagName === 'INPUT' && e.target.type === 'range';
}, {passive: true});

document.addEventListener('touchmove', e => {
    if (isSlider) return; 
    let scrollableTarget = e.target.closest('.overflow-y-auto');
    if (scrollableTarget) {
        if (scrollableTarget.scrollTop <= 0 && e.touches[0].pageY > startY) e.preventDefault();
        return; 
    }
    if (window.scrollY === 0 && e.touches[0].pageY > startY) e.preventDefault();
}, {passive: false});

// Fonction de démarrage (appelée au chargement)
function init() {
    switchTheme('assistant'); // Définit le thème assistant par défaut
    generateCheckboxes('t1');
    generateCheckboxes('t2');
    generateCheckboxes('wiz'); 
    
    document.getElementById('t1_aroma_pg_val').innerText = document.getElementById('t1_aroma_pg').value + '%';
    updateRatioDisp('t1');
    updateRatioDisp('t2');
    updateAromaPreview('t1');
    updateAromaPreview('t2');
    triggerCalc();
    wizUpdateView();
}

window.onload = () => { init(); };


/* ========================================== */
/* 2. FONCTIONS UTILITAIRES DE CALCUL         */
/* ========================================== */

// Calcule le poids en grammes en fonction du volume et du ratio PG/VG
function getWeight(vol, pgRatio) {
    return vol * ((pgRatio * DENSITY_PG + (100 - pgRatio) * DENSITY_VG) / 100);
}

// Formate l'affichage texte du ratio (ex: "50/50" ou "50PG / 50VG")
function formatRatioStr(pg, labels = false) {
    let p = Math.round(pg);
    if (p === 100) return "100% PG";
    if (p === 0) return "100% VG";
    return labels ? `${p}PG / ${100-p}VG` : `${p}/${100-p}`;
}

// On arrondit à 1 ou 2 décimales pour que l'affichage soit propre
function round1(num) { return Math.round(num * 10) / 10; }
function round2(num) { return Math.round(num * 100) / 100; }

// Ajoute ou retire une valeur avec les boutons + et -
function adjustVal(id, step) {
    let el = document.getElementById(id);
    if(!el) return;
    let val = parseFloat(el.value) || 0;
    let newVal = val + step;
    if(newVal < 0) newVal = 0;
    el.value = newVal;
    
    let prefix = id.substring(0, 2);
    let isTabBoost = id.startsWith('tab_boost');
    
    if (prefix === 't1' || prefix === 't2') {
        updateAromaPreview(prefix);
        triggerCalc();
    } else if (prefix === 'wi') {
        // Pour l'assistant, l'UI est mise à jour sans calcul direct
    } else if (isTabBoost) {
        triggerCalc();
    } else {
        triggerCalc();
    }
}

// Renvoie un tableau des ratios cochés (bases ou boosters) triés
function getChecked(className) {
    let arr = [];
    document.querySelectorAll(`.${className}:checked`).forEach(el => arr.push(parseInt(el.value)));
    return arr.sort((a,b)=>b-a);
}

// Évite d'afficher 4 fois la même recette mathématiquement
function deduplicateRecipes(arr) {
    let seen = new Set();
    return arr.filter(r => {
        let basesKey = r.bases.filter(b => b.vol >= 0.1).map(b => `${b.pgRatio}-${round1(b.vol)}`).sort().join('|');
        let nicKey = r.nic > 0 ? `${r.nicRatio}-${round1(r.nic)}` : '0';
        let key = `${round1(r.aroma)}_${nicKey}_${basesKey}`;
        if(seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}


/* ========================================== */
/* 3. GESTION DE L'INTERFACE ET THÈMES        */
/* ========================================== */

// Change la couleur dominante du CSS (le "data-theme")
function switchTheme(theme) {
    document.documentElement.dataset.theme = theme;
}

const moonIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
const sunIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`;

// Bascule entre mode clair et sombre (Dark Mode)
function applyTheme() {
    if (localStorage.theme === 'dark' || (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        document.getElementById('theme_toggle_btn').innerHTML = sunIcon;
        let metaTheme = document.getElementById('meta-theme-color');
        if(metaTheme) metaTheme.content = '#1c1917';
    } else {
        document.documentElement.classList.remove('dark');
        document.getElementById('theme_toggle_btn').innerHTML = moonIcon;
        let metaTheme = document.getElementById('meta-theme-color');
        if(metaTheme) metaTheme.content = '#f5f5f4';
    }
}
function toggleTheme() {
    if (document.documentElement.classList.contains('dark')) {
        document.documentElement.classList.remove('dark');
        localStorage.theme = 'light';
        document.getElementById('theme_toggle_btn').innerHTML = moonIcon;
    } else {
        document.documentElement.classList.add('dark');
        localStorage.theme = 'dark';
        document.getElementById('theme_toggle_btn').innerHTML = sunIcon;
    }
}
applyTheme();

// Naviguer entre les onglets
function switchTab(tabId) {
    if (tabId === 'tab_boost_simple') document.documentElement.dataset.theme = 'boost';
    else if (tabId === 'tab_complet') document.documentElement.dataset.theme = 'complet';
    else if (tabId === 'tab_booster') document.documentElement.dataset.theme = 'shortfill';
    else if (tabId === 'tab_manuel') document.documentElement.dataset.theme = 'manuel';
    else if (tabId === 'tab_assistant') {
        if (wizState.step < 2) {
            document.documentElement.dataset.theme = 'assistant';
        } else {
             if (wizState.type === 't1') document.documentElement.dataset.theme = 'complet';
             else if (wizState.type === 't2') document.documentElement.dataset.theme = 'shortfill';
        }
    }

    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('button[id^="btn_tab_"]').forEach(el => {
        let baseClasses = "py-2.5 px-2 sm:px-4 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1 sm:gap-2 ";
        if (el.id === 'btn_tab_manuel') baseClasses = "col-span-2 md:col-span-1 lg:col-span-1 " + baseClasses;

        if (el.id === 'btn_' + tabId) {
            el.className = baseClasses + "bg-white dark:bg-stone-700 text-brand-600 dark:text-brand-400 shadow-md transform -translate-y-0.5 ring-1 ring-black/5 dark:ring-white/10";
        } else {
            el.className = baseClasses + "text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-200 dark:hover:bg-stone-700";
        }
    });
    document.getElementById(tabId).classList.add('active');
    triggerCalc();
}

// Change le comportement : Fixer un volume final VS Vider sa bouteille d'arôme
function toggleVolMode(prefix, mode) {
    state[prefix].vol_mode = mode;
    let btnDef = document.getElementById(`${prefix}_mode_vol_def`);
    let btnMax = document.getElementById(`${prefix}_mode_vol_max`);
    let activeClass = "flex-1 py-2 rounded-lg text-sm font-bold bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm transition-all";
    let inactiveClass = "flex-1 py-2 rounded-lg text-sm font-bold text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 transition-all";

    if(mode === 'defined') {
        btnDef.className = activeClass;
        btnMax.className = inactiveClass;
        document.getElementById(`${prefix}_vol_panel`).classList.remove('hidden');
        document.getElementById(`${prefix}_aroma_avail_panel`).classList.add('hidden');
        document.getElementById(`${prefix}_vol_preview_container`).classList.add('hidden');
        document.getElementById(`${prefix}_aroma_sync_wrapper`).classList.remove('hidden');
        document.getElementById(`${prefix}_aroma_sync_wrapper`).classList.add('flex');
    } else {
        btnMax.className = activeClass;
        btnDef.className = inactiveClass;
        document.getElementById(`${prefix}_vol_panel`).classList.add('hidden');
        document.getElementById(`${prefix}_aroma_avail_panel`).classList.remove('hidden');
        document.getElementById(`${prefix}_vol_preview_container`).classList.remove('hidden');
        document.getElementById(`${prefix}_aroma_sync_wrapper`).classList.add('hidden');
        document.getElementById(`${prefix}_aroma_sync_wrapper`).classList.remove('flex');
    }
    updateAromaPreview(prefix);
    triggerCalc();
}

// Change le comportement : mg/ml cible VS ajout au nombre de boosters
function setNicMode(prefix, mode) {
    state[prefix].nic_mode = mode;
    let btnMg = document.getElementById(`${prefix}_nic_mode_mg_btn`);
    let btnBoost = document.getElementById(`${prefix}_nic_mode_boost_btn`);

    let activeClass = "flex-1 py-1.5 rounded-lg text-xs font-bold bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 shadow-sm transition-all";
    let inactiveClass = "flex-1 py-1.5 rounded-lg text-xs font-bold text-stone-500 dark:text-stone-400 hover:text-stone-700 dark:hover:text-stone-300 transition-all";

    if(mode === 'mg') {
        btnMg.className = activeClass;
        btnBoost.className = inactiveClass;
        document.getElementById(`${prefix}_nic_mg_panel`).classList.remove('hidden');
        document.getElementById(`${prefix}_nic_mg_panel`).classList.add('flex');
        document.getElementById(`${prefix}_nic_boost_panel`).classList.add('hidden');
        document.getElementById(`${prefix}_nic_boost_panel`).classList.remove('flex');
    } else {
        btnBoost.className = activeClass;
        btnMg.className = inactiveClass;
        document.getElementById(`${prefix}_nic_boost_panel`).classList.remove('hidden');
        document.getElementById(`${prefix}_nic_boost_panel`).classList.add('flex');
        document.getElementById(`${prefix}_nic_mg_panel`).classList.add('hidden');
        document.getElementById(`${prefix}_nic_mg_panel`).classList.remove('flex');
    }
    if(prefix === 't1') updateNicPreview('t1');
    triggerCalc();
}

function toggleAdvAroma(prefix) {
    let chk = document.getElementById(`${prefix}_adv_aroma`).checked;
    let panel = document.getElementById(`${prefix}_aroma_pg_panel`);
    if(chk) panel.classList.remove('hidden');
    else { panel.classList.add('hidden'); document.getElementById(`${prefix}_aroma_pg`).value = 0; document.getElementById(`${prefix}_aroma_pg_val`).innerText = '100% PG'; }
}

// Mise à jour visuelle des taux en direct
function updateNicPreview(prefix) {
    if (prefix !== 't1') return;
    let finalVol = 0;
    if(state.t1.vol_mode === 'defined') {
        finalVol = parseFloat(document.getElementById('t1_vol').value) || 0;
    } else {
        let avail = parseFloat(document.getElementById('t1_aroma_avail').value) || 0;
        let perc = parseFloat(document.getElementById('t1_aroma_perc').value) || 0;
        if(perc > 0) finalVol = avail / (perc / 100);
    }
    let bStr = parseFloat(document.getElementById('t1_booster_str').value) || 20;

    if (state.t1.nic_mode === 'mg') {
        let targetMg = parseFloat(document.getElementById('t1_nic_mg').value) || 0;
        let nicVol = (finalVol * targetMg) / bStr;
        let boostersCount = nicVol / 10;
        document.getElementById('t1_nic_mg_preview').innerHTML = `Quantité : <span class="text-brand-600 dark:text-brand-400">${round1(nicVol)} ml</span> <span class="text-stone-400 dark:text-stone-500 font-normal">(soit ${round1(boostersCount)} booster${boostersCount > 1 ? 's' : ''})</span>`;
    } else {
        let bCount = parseFloat(document.getElementById('t1_nic_boost').value) || 0;
        let nicVol = bCount * 10;
        let finalMg = finalVol > 0 ? (nicVol * bStr) / finalVol : 0;
        document.getElementById('t1_nic_boost_preview').innerHTML = `Taux final : <span class="text-brand-600 dark:text-brand-400">${round1(finalMg)} mg/ml</span>`;
    }
}

function updateRatioDisp(prefix) {
    let sliderVal = document.getElementById(`${prefix}_ratio_pg`).value;
    let pg = 100 - sliderVal;
    document.getElementById(`${prefix}_ratio_disp`).innerText = formatRatioStr(pg, true);
}

function updateAromaPreview(prefix) {
    let percEl = document.getElementById(`${prefix}_aroma_perc`);
    if(percEl) document.getElementById(`${prefix}_aroma_perc_disp`).innerText = `${percEl.value}%`;

    if(state[prefix].vol_mode === 'max_aroma') {
        let avail = parseFloat(document.getElementById(`${prefix}_aroma_avail`).value) || 0;
        let perc = parseFloat(document.getElementById(`${prefix}_aroma_perc`).value) || 0;
        
        if(perc > 0) {
            if(prefix === 't1') {
                let finalVol = avail / (perc / 100);
                document.getElementById('t1_vol_preview').innerText = `${round1(finalVol)} ml`;
            } else if(prefix === 't2') {
                let finalVol = avail / (perc / 100);
                let maxNic = parseFloat(document.getElementById('t2_max_nic').value) || 0;
                let bStr = parseFloat(document.getElementById('t2_booster_str').value) || 20;
                let bVol = (finalVol * maxNic) / bStr;
                let prepVol = finalVol - bVol;
                document.getElementById('t2_vol_preview').innerText = `${round1(finalVol)} ml total`;
                document.getElementById('t2_vol_preview_sub').innerText = `soit ${round1(prepVol)} ml à préparer (avant boost)`;
            }
        } else {
            document.getElementById(`${prefix}_vol_preview`).innerText = `Erreur %`;
        }
    } else if (state[prefix].vol_mode === 'defined') {
        let syncInput = document.getElementById(`${prefix}_aroma_sync_ml`);
        if(syncInput) {
            let perc = parseFloat(percEl.value) || 0;
            let vol = 0;
            if(prefix === 't1') {
                vol = parseFloat(document.getElementById('t1_vol').value) || 0;
            } else if(prefix === 't2') {
                let prepVol = parseFloat(document.getElementById('t2_vol').value) || 0;
                let maxNic = parseFloat(document.getElementById('t2_max_nic').value) || 0;
                let bStr = parseFloat(document.getElementById('t2_booster_str').value) || 20;
                if(1 - maxNic/bStr > 0) vol = prepVol / (1 - maxNic/bStr);
            }
            syncInput.value = round2(vol * (perc / 100));
        }
    }
    if(prefix === 't1') updateNicPreview('t1');
}

// Permet de taper les ml d'arôme manuellement et met à jour le curseur de pourcentage
function syncAromaFromMl(prefix) {
    let syncInput = document.getElementById(`${prefix}_aroma_sync_ml`);
    let percInput = document.getElementById(`${prefix}_aroma_perc`);
    let ml = parseFloat(syncInput.value) || 0;
    let vol = 0;
    
    if(prefix === 't1') {
        vol = parseFloat(document.getElementById('t1_vol').value) || 0;
    } else if(prefix === 't2') {
        let prepVol = parseFloat(document.getElementById('t2_vol').value) || 0;
        let maxNic = parseFloat(document.getElementById('t2_max_nic').value) || 0;
        let bStr = parseFloat(document.getElementById('t2_booster_str').value) || 20;
        if(1 - maxNic/bStr > 0) vol = prepVol / (1 - maxNic/bStr);
    }
    
    if(vol > 0) {
        let perc = (ml / vol) * 100;
        let min = parseFloat(percInput.min);
        let max = parseFloat(percInput.max);
        if(perc < min) perc = min;
        if(perc > max) perc = max;
        
        percInput.value = round1(perc);
        document.getElementById(`${prefix}_aroma_perc_disp`).innerText = `${percInput.value}%`;
        triggerCalc();
    }
}


/* ========================================== */
/* 4. MODE ASSISTANT (WIZARD)                 */
/* ========================================== */

function wizUpdateView() {
    ALL_WIZ_STEPS.forEach(id => {
        let el = document.getElementById('wiz_' + id);
        if(el) { el.classList.add('hidden'); el.classList.remove('block'); }
    });
    
	if (wizState.step < 2) {
        switchTheme('assistant');
    } else {
        if (wizState.type === 't1') switchTheme('complet');
        else if (wizState.type === 't2') switchTheme('shortfill');
    }
	
    let curStepId = wizState.path[wizState.step];
    let curEl = document.getElementById('wiz_' + curStepId);
    if(curEl) { curEl.classList.remove('hidden'); curEl.classList.add('block'); }

    let progCont = document.getElementById('wiz_progress_container');
    let progBar = document.getElementById('wiz_progress_bar');
    let navBar = document.getElementById('wiz_nav');

    if(wizState.step === 0 || wizState.step === wizState.path.length - 1) {
        progCont.classList.add('hidden'); navBar.classList.add('hidden');
    } else {
        progCont.classList.remove('hidden'); navBar.classList.remove('hidden');
        let percent = (wizState.step / (wizState.path.length - 2)) * 100;
        progBar.style.width = percent + '%';
    }

    let btnNext = document.getElementById('wiz_btn_next');
    if (wizState.step === wizState.path.length - 2) btnNext.innerText = "Calculer 🚀";
    else btnNext.innerText = "Suivant";
}

function wizNext() {
    if(wizState.step < wizState.path.length - 1) {
        if(wizState.step === wizState.path.length - 2) runWizCalculation();
        wizState.step++;
        wizUpdateView();
    }
}

function wizPrev() {
    if(wizState.step > 1) {
        wizState.step--; wizUpdateView();
    } else if (wizState.step === 1) {
        wizState.step = 0; wizUpdateView();
    }
}

function wizRestart() {
    wizState.step = 0;
    document.getElementById('wiz_results_container').innerHTML = '';
    wizUpdateView();
}

function wizSetType(type) {
    wizState.type = type;
    wizState.path = WIZ_PATH_MAIN;
    
    let percLabel = document.getElementById('wiz_aroma_perc_label');
    let percHelp = document.getElementById('wiz_aroma_perc_help');
    
    if (type === 't1') switchTheme('complet');
    else if (type === 't2') switchTheme('shortfill');
    
    if(type === 't1') {
        document.getElementById('wiz_nic_t1_block').classList.remove('hidden');
        document.getElementById('wiz_nic_t2_block').classList.add('hidden');
        document.getElementById('wiz_boosters_container').classList.remove('hidden');
        document.getElementById('wiz_nic_desc').innerText = "Règle ton taux pour ce jus.";
        if (percLabel) percLabel.innerText = "À quel pourcentage tu doses ?";
        if (percHelp) percHelp.classList.add('hidden');
    } else if (type === 't2') {
        document.getElementById('wiz_nic_t1_block').classList.add('hidden');
        document.getElementById('wiz_nic_t2_block').classList.remove('hidden');
        document.getElementById('wiz_boosters_container').classList.add('hidden');
        document.getElementById('wiz_nic_desc').innerText = "Combien de mg/ml penses-tu ajouter max plus tard ?";
        if (percLabel) percLabel.innerText = "Dosage idéal recommandé de l'arôme ?";
        if (percHelp) percHelp.classList.remove('hidden');
    }
    wizNext();
}

function wizSetVolMode(mode) {
    wizState.volMode = mode;
    if(mode === 'defined') {
        document.getElementById('wiz_vol_defined_block').classList.remove('hidden');
        document.getElementById('wiz_vol_max_block').classList.add('hidden');
        document.getElementById('wiz_vol_help').innerText = wizState.type === 't1' ? "" : "(avant ajout des boosters)";
    } else {
        document.getElementById('wiz_vol_defined_block').classList.add('hidden');
        document.getElementById('wiz_vol_max_block').classList.remove('hidden');
    }
    wizNext();
}

// Exécute le calcul en arrière-plan avec les paramètres du wizard
function runWizCalculation() {
    let prefix = wizState.type; 

    toggleVolMode(prefix, wizState.volMode);

    if (wizState.volMode === 'defined') {
        document.getElementById(prefix + '_vol').value = document.getElementById('wiz_vol').value;
    } else {
        document.getElementById(prefix + '_aroma_avail').value = document.getElementById('wiz_aroma_avail').value;
    }
    document.getElementById(prefix + '_aroma_perc').value = document.getElementById('wiz_aroma_perc').value;

    // --- Transfert du ratio d'arôme ---
    let isAdvAroma = document.getElementById('wiz_adv_aroma').checked;
    let aromaPgVal = document.getElementById('wiz_aroma_pg').value;

    let tabAdvChk = document.getElementById(prefix + '_adv_aroma');
    if (tabAdvChk) {
        tabAdvChk.checked = isAdvAroma;
        toggleAdvAroma(prefix); // Gère l'affichage du panel dans l'onglet
        if (isAdvAroma) {
            document.getElementById(prefix + '_aroma_pg').value = aromaPgVal;
            document.getElementById(prefix + '_aroma_pg_val').innerText = formatRatioStr(100 - aromaPgVal, false);
        } else {
            document.getElementById(prefix + '_aroma_pg').value = 0;
            document.getElementById(prefix + '_aroma_pg_val').innerText = '100% PG';
        }
    }

    document.getElementById(prefix + '_ratio_pg').value = document.getElementById('wiz_ratio_pg').value;
    updateRatioDisp(prefix);

    document.getElementById(prefix + '_booster_str').value = document.getElementById('wiz_booster_str').value;
    if (prefix === 't1') {
        setNicMode('t1', 'mg'); 
        document.getElementById('t1_nic_mg').value = document.getElementById('wiz_nic_mg').value;
    } else {
        document.getElementById('t2_max_nic').value = document.getElementById('wiz_max_nic').value;
    }

    document.querySelectorAll('.' + prefix + '_base_chk').forEach(el => {
        el.checked = false; el.parentElement.classList.remove('checked-base');
    });
    if (prefix === 't1') {
        document.querySelectorAll('.t1_boost_chk').forEach(el => {
            el.checked = false; el.parentElement.classList.remove('checked-boost');
        });
    }

    let wBases = getChecked('wiz_base_chk');
    wBases.forEach(val => {
        let el = document.querySelector(`.${prefix}_base_chk[value="${val}"]`);
        if(el) { el.checked = true; el.parentElement.classList.add('checked-base'); }
    });

    if (prefix === 't1') {
        let wBoost = getChecked('wiz_boost_chk');
        wBoost.forEach(val => {
            let el = document.querySelector(`.t1_boost_chk[value="${val}"]`);
            if(el) { el.checked = true; el.parentElement.classList.add('checked-boost'); }
        });
    }

    // Lancement du bon module
    if (prefix === 't1') calcTab1(); else calcTab2();

    // Récupère le visuel pour le Wizard
    let resultHtml = document.getElementById(prefix + '_results_container').innerHTML;
    document.getElementById('wiz_results_container').innerHTML = resultHtml;

    document.getElementById('wiz_s7_title').innerText = "Et voilà le travail ! 🎉";
    document.getElementById('wiz_s7_desc').innerText = "J'ai calculé les meilleures combinaisons avec ton matériel.";
    document.getElementById('wiz_res_tab_name').innerText = prefix === 't1' ? "Liquide Complet" : "Créer Shortfill";
    document.getElementById('wiz_s7_info_block').classList.remove('hidden');
}


/* ========================================== */
/* 5. MOTEUR DE CALCUL CENTRAL                */
/* ========================================== */

// Cherche le bon onglet et lance le calcul correspondant
function triggerCalc() {
    pendingNewRecipe = true; 
    let activeTab = document.querySelector('.tab-content.active').id;
    if(activeTab === 'tab_complet') calcTab1();
    else if(activeTab === 'tab_booster') calcTab2();
    else if(activeTab === 'tab_manuel') calcTab3();
    else if(activeTab === 'tab_boost_simple') calcBoostSimple('tab_boost', 'tab_boost_results');
}

// Essaye de trouver un mix entre 2 bases pour arriver au ratio exact
function findBaseMixes(targetVol, targetPgMl, basesObj) {
    let results = [];
    let targetRatio = targetVol > 0 ? (targetPgMl / targetVol) * 100 : 0;

    for(let basePg of basesObj) {
        if(Math.abs(basePg - targetRatio) < 0.1) {
            results.push([{ pgRatio: basePg, vol: targetVol }]);
        }
    }

    for(let i=0; i<basesObj.length; i++) {
        for(let j=i+1; j<basesObj.length; j++) {
            let pg1 = basesObj[i];
            let pg2 = basesObj[j];
            if(pg1 === pg2) continue;
            
            let v1 = (targetPgMl - targetVol * (pg2/100)) / ((pg1/100) - (pg2/100));
            let v2 = targetVol - v1;
            
            // Nettoyage de la virgule flottante
            if(Math.abs(v1) < 1e-5) v1 = 0;
            if(Math.abs(v2) < 1e-5) v2 = 0;
            
            if(v1 >= 0 && v2 >= 0) {
                results.push([
                    { pgRatio: pg1, vol: v1 },
                    { pgRatio: pg2, vol: v2 }
                ]);
            }
        }
    }
    return results.length > 0 ? results : null;
}

// --- CALCULS PAR ONGLET ---

// Calcul Boost Simple
function calcBoostSimple(prefix, containerId) {
    let vol = parseFloat(document.getElementById(prefix + '_vol').value) || 0;
    let bCount = parseFloat(document.getElementById(prefix + '_count').value) || 0;
    let advChecked = document.getElementById(prefix + '_adv').checked;
    
    let pgVal = parseFloat(document.getElementById(prefix + '_pg').value);
    let pg = isNaN(pgVal) ? 50 : (100 - pgVal);
    
    let strEl = document.getElementById(prefix + '_str');
    let strVal = strEl ? parseFloat(strEl.value) : 20;
    let bStr = isNaN(strVal) ? 20 : strVal;
    
    let bPgVal = parseFloat(document.getElementById(prefix + '_bpg').value);
    let bPg = isNaN(bPgVal) ? 50 : (100 - bPgVal);

    let bVol = bCount * 10;
    let finalVol = vol + bVol;
    
    if (finalVol <= 0) {
        document.getElementById(containerId).innerHTML = `<div class="animate-fade-in p-4 bg-stone-100 dark:bg-stone-800 text-stone-500 rounded-2xl text-center">Entre un volume ou des boosters pour voir le résultat.</div>`;
        return;
    }

    let finalNic = finalVol > 0 ? (bVol * bStr) / finalVol : 0;
    let ratioHtml = "";
    
    if (advChecked) {
        let totalPgMl = (vol * (pg / 100)) + (bVol * (bPg / 100));
        let finalPgRatio = finalVol > 0 ? (totalPgMl / finalVol) * 100 : 50;
        ratioHtml = `
            <div class="bg-white dark:bg-stone-800 p-4 rounded-2xl shadow-sm border border-stone-100 dark:border-stone-700/50 flex flex-col justify-center text-center transition-colors">
                <span class="text-[10px] text-stone-500 dark:text-stone-400 font-bold uppercase tracking-wider mb-1">Ratio Final</span>
                <span class="text-sm font-black text-brand-600 dark:text-brand-400 mt-1">${formatRatioStr(finalPgRatio, true)}</span>
            </div>`;
    }

    // Génère l'interface
    let visualCap = finalVol * 1.1; 
    let hJuice = (vol / visualCap) * 100;
    let hBoost = (bVol / visualCap) * 100;
    let hAir = 100 - hJuice - hBoost;

    let html = `
        <div class="animate-fade-in flex flex-col md:flex-row gap-6 items-center md:items-stretch bg-brand-50/50 dark:bg-brand-900/10 p-4 rounded-3xl border border-brand-200 dark:border-brand-800/50 transition-colors">
            <div class="flex-shrink-0 w-32 h-56 relative flex items-end justify-center py-4">
                <div class="relative w-16 h-40 border-4 border-white dark:border-stone-600/50 rounded-b-2xl rounded-t-xl shadow-lg flex flex-col justify-end overflow-hidden bg-white/20 backdrop-blur-sm z-20">
                    <div style="height: ${hAir}%" class="w-full bg-transparent"></div>
                    <div style="height: ${hBoost}%" class="w-full bg-brand-400/90 dark:bg-brand-500/90 relative flex justify-center items-center">
                        ${bVol > 0 && hBoost > 10 ? `<span class="text-[9px] text-white font-black">BOOST</span>` : ''}
                    </div>
                    <div style="height: ${hJuice}%" class="w-full bg-stone-500/90 dark:bg-stone-600/90 relative flex justify-center items-center">
                        ${vol > 0 && hJuice > 10 ? `<span class="text-[10px] text-white font-black">JUS</span>` : ''}
                    </div>
                </div>
            </div>
            <div class="flex-1 w-full grid grid-cols-2 gap-3 py-2 content-center">
                <div class="col-span-2 bg-white dark:bg-stone-800 p-4 rounded-2xl shadow-sm border border-stone-100 dark:border-stone-700/50 flex flex-col justify-center text-center transition-colors">
                    <span class="text-xs text-stone-500 dark:text-stone-400 font-bold uppercase tracking-wider mb-1">Volume Final</span>
                    <span class="text-3xl font-black text-stone-800 dark:text-stone-100">${round1(finalVol)} ml</span>
                </div>
                <div class="bg-brand-50 dark:bg-brand-900/20 p-4 rounded-2xl border border-brand-100 dark:border-brand-800/50 flex flex-col justify-center text-center transition-colors">
                    <span class="text-[10px] text-brand-700/70 dark:text-brand-400/70 font-bold uppercase tracking-wider mb-1">Nicotine</span>
                    <span class="text-xl font-black text-brand-600 dark:text-brand-400">${round1(finalNic)} <span class="text-xs">mg</span></span>
                </div>
                ${ratioHtml}
            </div>
        </div>
    `;
    document.getElementById(containerId).innerHTML = html;
}

// Calcul Liquide Complet (Onglet S1)
function calcTab1() {
    let finalVol, aromaVol;
    let aromaPgVal = parseInt(document.getElementById('t1_aroma_pg').value);
    let aromaPg = isNaN(aromaPgVal) ? 100 : (100 - aromaPgVal); // VG mapping

    if(state.t1.vol_mode === 'defined') {
        finalVol = parseFloat(document.getElementById('t1_vol').value) || 0;
        let p = parseFloat(document.getElementById('t1_aroma_perc').value) || 0;
        aromaVol = finalVol * (p/100);
    } else {
        aromaVol = parseFloat(document.getElementById('t1_aroma_avail').value) || 0;
        let p = parseFloat(document.getElementById('t1_aroma_perc').value) || 0;
        if(p <= 0) { renderRecipes('t1', [], [{err: "Le pourcentage d'arôme doit être supérieur à 0."}]); return; }
        finalVol = aromaVol / (p/100);
    }

    if(finalVol <= 0 || aromaVol > finalVol) {
         renderRecipes('t1', [], [{err: "Volumes incohérents."}]); return;
    }

    let targetPgRatio = 100 - parseInt(document.getElementById('t1_ratio_pg').value);
    let bStr = parseFloat(document.getElementById('t1_booster_str').value) || 20;
    
    let nicVol = 0;
    if(state.t1.nic_mode === 'mg') {
        let mg = parseFloat(document.getElementById('t1_nic_mg').value) || 0;
        nicVol = (finalVol * mg) / bStr;
    } else {
        let bCount = parseFloat(document.getElementById('t1_nic_boost').value) || 0;
        nicVol = bCount * 10;
    }

    let baseVol = finalVol - aromaVol - nicVol;
    if (Math.abs(baseVol) < 1e-6) baseVol = 0; // Fix flottant
    if(baseVol < 0) {
        renderRecipes('t1', [], [{err: "Pas de place pour la base ! Réduisez l'arôme ou la nicotine."}]); return;
    }

    let basesAvail = getChecked('t1_base_chk');
    let boostsAvail = getChecked('t1_boost_chk');
    
    if(basesAvail.length === 0 || boostsAvail.length === 0) {
        renderRecipes('t1', [], [{err: "Cochez au moins une base et un booster."}]); return;
    }

    let targetPgMl = finalVol * (targetPgRatio / 100);
    let aromaPgMl = aromaVol * (aromaPg / 100);

    let exactRecipes = [];
    let altRecipes = [];

    for(let bPg of boostsAvail) {
        let boostPgMl = nicVol * (bPg / 100);
        let remainingPgNeeded = targetPgMl - aromaPgMl - boostPgMl;
        
        let mixes = findBaseMixes(baseVol, remainingPgNeeded, basesAvail);
        
        if(mixes) {
            for(let mix of mixes) {
                exactRecipes.push({
                    aroma: aromaVol, aromaPg: aromaPg, nic: nicVol, nicRatio: bPg, bases: mix,
                    finalVol: finalVol, realPgRatio: targetPgRatio
                });
            }
        } else {
            let bestBase = basesAvail[0];
            let minDiff = 9999;
            for(let bp of basesAvail) {
                let testPg = aromaPgMl + boostPgMl + (baseVol * (bp/100));
                let diff = Math.abs(testPg - targetPgMl);
                if(diff < minDiff) { minDiff = diff; bestBase = bp; }
            }
            let realPg = ((aromaPgMl + boostPgMl + (baseVol * (bestBase/100))) / finalVol) * 100;
            altRecipes.push({
                aroma: aromaVol, aromaPg: aromaPg, nic: nicVol, nicRatio: bPg,
                bases: [{pgRatio: bestBase, vol: baseVol}],
                finalVol: finalVol, realPgRatio: realPg, isAlt: true
            });
        }
    }

    exactRecipes = deduplicateRecipes(exactRecipes);
    altRecipes = deduplicateRecipes(altRecipes);
    altRecipes.sort((a,b) => Math.abs(a.realPgRatio - targetPgRatio) - Math.abs(b.realPgRatio - targetPgRatio));

    renderRecipes('t1', exactRecipes, altRecipes);
}

// Calcul Création Shortfill (Onglet S2)
function calcTab2() {
    let finalVolAfterBoost, prepVol, aromaVol;
    let targetAromaPerc = parseFloat(document.getElementById('t2_aroma_perc').value) || 15;
    let maxNic = parseFloat(document.getElementById('t2_max_nic').value) || 0;
    let bStr = parseFloat(document.getElementById('t2_booster_str').value) || 20;

    if(state.t2.vol_mode === 'defined') {
        prepVol = parseFloat(document.getElementById('t2_vol').value) || 0;
        if(1 - maxNic/bStr <= 0) {
            renderRecipes('t2', [], [{err: "Taux max nicotine impossible avec ce booster."}]); return;
        }
        finalVolAfterBoost = prepVol / (1 - maxNic/bStr);
        aromaVol = finalVolAfterBoost * (targetAromaPerc / 100);
    } else {
        aromaVol = parseFloat(document.getElementById('t2_aroma_avail').value) || 0;
        if(targetAromaPerc <= 0) { renderRecipes('t2', [], [{err: "Pourcentage d'arôme > 0 requis."}]); return; }
        finalVolAfterBoost = aromaVol / (targetAromaPerc / 100);
        let boosterMaxVol = (finalVolAfterBoost * maxNic) / bStr;
        prepVol = finalVolAfterBoost - boosterMaxVol;
    }

    if(prepVol <= 0 || aromaVol > prepVol) {
        renderRecipes('t2', [], [{err: "La concentration demandée ne laisse pas de place pour la base neutre !"}]); return;
    }

    let baseVol = prepVol - aromaVol;
    if (Math.abs(baseVol) < 1e-6) baseVol = 0; // Fix flottant
    let shortfillTargetPgRatio = 100 - parseInt(document.getElementById('t2_ratio_pg').value);
    
    let aromaPgVal = parseInt(document.getElementById('t2_aroma_pg').value);
    let aromaPg = isNaN(aromaPgVal) ? 100 : (100 - aromaPgVal);

    let shortfillTargetPgMl = prepVol * (shortfillTargetPgRatio / 100);
    let aromaPgMl = aromaVol * (aromaPg / 100);
    
    let remainingPgNeededInBase = shortfillTargetPgMl - aromaPgMl;

    let basesAvail = getChecked('t2_base_chk');
    if(basesAvail.length === 0) { renderRecipes('t2', [], [{err: "Cochez au moins une base."}]); return; }

    let exactRecipes = [];
    let altRecipes = [];

    let mixes = findBaseMixes(baseVol, remainingPgNeededInBase, basesAvail);
    
    if(mixes) {
        for(let mix of mixes) {
            exactRecipes.push({
                aroma: aromaVol, aromaPg: aromaPg, bases: mix, prepVol: prepVol, finalVol: finalVolAfterBoost,
                realPgRatio: shortfillTargetPgRatio, nicMax: maxNic
            });
        }
    } else {
        let bestBase = basesAvail[0];
        let minDiff = 9999;
        for(let bp of basesAvail) {
            let testPg = aromaPgMl + (baseVol * (bp/100)); 
            let diff = Math.abs(testPg - shortfillTargetPgMl);
            if(diff < minDiff) { minDiff = diff; bestBase = bp; }
        }
        let realPg = ((aromaPgMl + (baseVol * (bestBase/100))) / prepVol) * 100;
        altRecipes.push({
            aroma: aromaVol, aromaPg: aromaPg, bases: [{pgRatio: bestBase, vol: baseVol}],
            prepVol: prepVol, finalVol: finalVolAfterBoost, realPgRatio: realPg, isAlt: true, nicMax: maxNic
        });
    }

    exactRecipes = deduplicateRecipes(exactRecipes);
    altRecipes = deduplicateRecipes(altRecipes);
    altRecipes.sort((a,b) => Math.abs(a.realPgRatio - shortfillTargetPgRatio) - Math.abs(b.realPgRatio - shortfillTargetPgRatio));

    renderRecipes('t2', exactRecipes, altRecipes);
}

// Calcul Mode Manuel (Onglet S3)
function calcTab3() {
    let aVol = parseFloat(document.getElementById('t3_aroma_vol').value)||0;
    let aPgVal = parseFloat(document.getElementById('t3_aroma_pg').value);
    let aPg = isNaN(aPgVal) ? 100 : (100 - aPgVal);
    
    let bVol = parseFloat(document.getElementById('t3_base_vol').value)||0;
    let bPgVal = parseFloat(document.getElementById('t3_base_pg').value);
    let bPg = isNaN(bPgVal) ? 50 : (100 - bPgVal);
    
    let nVol = parseFloat(document.getElementById('t3_boost_vol').value)||0;
    let nPgVal = parseFloat(document.getElementById('t3_boost_pg').value);
    let nPg = isNaN(nPgVal) ? 50 : (100 - nPgVal);
    
    let strVal = parseFloat(document.getElementById('t3_boost_str').value);
    let str = isNaN(strVal) ? 20 : strVal;

    let aWeight = getWeight(aVol, aPg);
    let bWeight = getWeight(bVol, bPg);
    let nWeight = getWeight(nVol, nPg);

    document.getElementById('t3_aroma_w').innerText = `${round1(aWeight)} g`;
    document.getElementById('t3_base_w').innerText = `${round1(bWeight)} g`;
    document.getElementById('t3_boost_w').innerText = `${round1(nWeight)} g`;

    let tVol = aVol + bVol + nVol;
    let tWeight = aWeight + bWeight + nWeight;

    if(tVol === 0) { document.getElementById('t3_results').innerHTML = `<div class="animate-fade-in">Aucun volume.</div>`; return; }

    let totalPg = (aVol*(aPg/100)) + (bVol*(bPg/100)) + (nVol*(nPg/100));
    let pgRatio = (totalPg / tVol) * 100;
    let aRatio = (aVol / tVol) * 100;
    let finalNic = (nVol * str) / tVol;

    let hiddenCardHtml = `
    <div id="t3_hidden_card" class="hidden">
        <div data-type="t1" data-ratio="${formatRatioStr(pgRatio, true)}" data-aroma-perc="${round1(aRatio)}" data-nic-mg="${round1(finalNic)}" class="recipe-card-wrapper p-5 border border-brand-200 dark:border-brand-700/50 bg-brand-50 dark:bg-brand-900/20 rounded-3xl flex flex-col transition-all w-full">
            <div class="flex-1">
                <div class="flex justify-between items-start mb-4 pb-3 border-b border-stone-200/60 dark:border-stone-700 transition-colors">
                    <div>
                        <div class="font-extrabold text-stone-800 dark:text-stone-100 text-lg leading-tight">Mélange Manuel <span class="text-brand-600 dark:text-brand-400">${round1(tVol)} ml</span></div>
                        <div class="mt-1.5"><span class="text-xs font-bold text-brand-700 dark:text-brand-400 px-2 py-1 bg-white dark:bg-stone-800 rounded-lg shadow-sm transition-colors">${formatRatioStr(pgRatio, true)}</span></div>
                    </div>
                </div>
                <div class="space-y-2 mb-4">
                    ${aVol > 0 ? `
                    <div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-50 dark:border-stone-700/50 transition-colors">
                        <span class="text-sm font-bold text-brand-600 dark:text-brand-400 flex items-center gap-2">Arôme <span class="text-xs font-bold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900/50 px-1.5 py-0.5 rounded transition-colors">${formatRatioStr(aPg, false)}</span></span>
                        <div class="text-right leading-tight">
                            <span class="font-black text-stone-800 dark:text-stone-200">${round1(aVol)} ml</span>
                            <span class="block text-xs font-bold text-brand-600 dark:text-brand-400 mt-0.5">${round1(aWeight)} g</span>
                        </div>
                    </div>` : ''}
                    ${bVol > 0 ? `
                    <div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-50 dark:border-stone-700/50 transition-colors">
                        <span class="text-sm font-bold text-stone-600 dark:text-stone-400 flex items-center gap-2">Base <span class="text-xs font-bold text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded transition-colors">${formatRatioStr(bPg, false)}</span></span>
                        <div class="text-right leading-tight">
                            <span class="font-black text-stone-800 dark:text-stone-200">${round1(bVol)} ml</span>
                            <span class="block text-xs font-bold text-brand-600 dark:text-brand-400 mt-0.5">${round1(bWeight)} g</span>
                        </div>
                    </div>` : ''}
                    ${nVol > 0 ? `
                    <div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-50 dark:border-stone-700/50 transition-colors">
                        <span class="text-sm font-bold text-brand-600 dark:text-brand-500 flex items-center gap-2">Booster <span class="text-xs font-bold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900/50 px-1.5 py-0.5 rounded transition-colors">${formatRatioStr(nPg, false)}</span></span>
                        <div class="text-right leading-tight">
                            <span class="font-black text-stone-800 dark:text-stone-200">${round1(nVol)} ml</span>
                            <span class="block text-xs font-bold text-brand-600 dark:text-brand-400 mt-0.5">${round1(nWeight)} g</span>
                        </div>
                    </div>` : ''}
                </div>
            </div>
            <div class="mt-auto pt-4 border-t border-stone-200/50 dark:border-stone-700 transition-colors">
                <div class="flex justify-between items-center">
                    <span class="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-widest">Taux finaux</span>
                    <div class="text-right">
                        <span class="text-lg font-black text-brand-600 dark:text-brand-400">${round1(aRatio)}%</span> <span class="text-xs text-stone-400 mr-1">arôme</span>
                        <span class="mx-1 text-stone-300 dark:text-stone-600">|</span>
                        <span class="text-lg font-black text-brand-700 dark:text-brand-400">${round1(finalNic)} mg/ml</span>
                    </div>
                </div>
                <div class="text-right text-xs font-bold text-brand-600 dark:text-brand-400 mt-1">Poids total estimé : ${round1(tWeight)} g</div>
            </div>
        </div>
    </div>`;

    document.getElementById('t3_results').innerHTML = `
        <div class="animate-fade-in">
            <div class="text-sm font-bold text-brand-600 dark:text-brand-400 uppercase tracking-wider mb-2">Volume Total : <span class="text-2xl text-stone-800 dark:text-stone-100 block">${round1(tVol)} ml <span class="text-base text-brand-600 dark:text-brand-400 font-black">(${round1(tWeight)} g)</span></span></div>
            <div class="grid grid-cols-3 gap-2 mt-4 text-left">
                <div class="bg-white dark:bg-stone-800 p-3 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors"><span class="text-[10px] text-stone-400 block uppercase">Ratio PG/VG</span><span class="font-bold text-stone-800 dark:text-stone-200">${formatRatioStr(pgRatio)}</span></div>
                <div class="bg-white dark:bg-stone-800 p-3 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors"><span class="text-[10px] text-stone-400 block uppercase">Dosage Arôme</span><span class="font-bold text-brand-600 dark:text-brand-400">${round1(aRatio)} %</span></div>
                <div class="bg-white dark:bg-stone-800 p-3 rounded-xl shadow-sm border border-stone-100 dark:border-stone-700 transition-colors"><span class="text-[10px] text-stone-400 block uppercase">Nicotine</span><span class="font-bold text-stone-800 dark:text-stone-200">${round1(finalNic)} mg</span></div>
            </div>
            
            <button onclick="openManualRecipeModal()" class="mt-5 w-full py-3 bg-white dark:bg-stone-700 hover:bg-brand-50 dark:hover:bg-stone-600 text-brand-600 dark:text-brand-400 border border-brand-200 dark:border-stone-600 rounded-xl font-bold shadow-sm transition-all flex items-center justify-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                Voir la fiche recette
            </button>
            ${hiddenCardHtml}
        </div>
    `;
}

function openManualRecipeModal() {
    let card = document.getElementById('t3_hidden_card').querySelector('.recipe-card-wrapper');
    currentRecipeCard = card;
    let clone = card.cloneNode(true);
    
    clone.classList.add('export-card', 'relative', 'w-full', 'shadow-2xl', 'dark:bg-stone-800', 'max-h-[85vh]', 'overflow-y-auto', 'hide-scrollbar');
    
    let buttonsHtml = `
        <div class="modal-buttons flex justify-between gap-3 mt-6 pt-4 border-t border-stone-200 dark:border-stone-700 print:hidden">
            <button onclick="closeRecipeModal()" class="px-5 py-2.5 bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 font-bold text-sm rounded-xl transition-colors">Fermer</button>
            <button onclick="openExportPrompt()" class="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm rounded-xl transition-colors shadow-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                Exporter
            </button>
        </div>
    `;
    clone.innerHTML += buttonsHtml;
    
    let modalContent = document.getElementById('recipe_modal_content');
    modalContent.innerHTML = '';
    modalContent.appendChild(clone);
    
    document.getElementById('recipe_modal').classList.remove('hidden');
}

/* ========================================== */
/* 6. AFFICHAGE ET GÉNÉRATION HTML DES CARTES */
/* ========================================== */

// Injecte les checkboxes Bases et Boosters selon le profil
function generateCheckboxes(prefix) {
    let baseContainer = document.getElementById(`${prefix}_bases_list`);
    let boostContainer = document.getElementById(`${prefix}_boosters_list`);
    let baseHtml = '', boostHtml = '';

    let defaultsBase = [100, 0];
    let defaultsBoost = ['t1', 'wiz'].includes(prefix) ? [50] : [];

    RATIOS.forEach(pg => {
        let isBaseChecked = defaultsBase.includes(pg) ? 'checked' : '';
        let isBoostChecked = defaultsBoost.includes(pg) ? 'checked' : '';
        
        baseHtml += `<label class="flex items-center gap-2 p-2 rounded-lg border border-stone-200 dark:border-stone-700 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors ${isBaseChecked?'checked-base':''}"><input type="checkbox" class="${prefix}_base_chk text-brand-600 focus:ring-brand-500 rounded dark:bg-stone-800 dark:border-stone-600" value="${pg}" ${isBaseChecked} onchange="this.parentElement.classList.toggle('checked-base', this.checked); triggerCalc()"><span class="text-xs font-bold text-stone-700 dark:text-stone-300">${formatRatioStr(pg, true)}</span></label>`;
        
        boostHtml += `<label class="flex items-center gap-2 p-2 rounded-lg border border-stone-200 dark:border-stone-700 cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800 transition-colors ${isBoostChecked?'checked-boost':''}"><input type="checkbox" class="${prefix}_boost_chk text-brand-600 focus:ring-brand-500 rounded dark:bg-stone-800 dark:border-stone-600" value="${pg}" ${isBoostChecked} onchange="this.parentElement.classList.toggle('checked-boost', this.checked); triggerCalc()"><span class="text-xs font-bold text-stone-700 dark:text-stone-300">${formatRatioStr(pg, true)}</span></label>`;
    });

    if(baseContainer) baseContainer.innerHTML = baseHtml;
    if(boostContainer) boostContainer.innerHTML = boostHtml;
}

// Gère l'affichage global des cartes résultats
function renderRecipes(prefix, exact, alt) {
    let container = document.getElementById(`${prefix}_results_container`);
    container.innerHTML = '';

    let hasErr = alt.length > 0 && alt[0].err;
    if(hasErr) {
        container.innerHTML = `<div class="animate-fade-in col-span-full p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-2xl font-bold text-sm text-center shadow-inner">${alt[0].err}</div>`;
        return;
    }

    let allHtml = '';
    
    if (exact.length > 0 || alt.length > 0) {
        allHtml += `
        <div class="animate-fade-in col-span-full mb-2 p-4 bg-brand-50/50 dark:bg-brand-900/10 border border-brand-200 dark:border-brand-800/50 rounded-2xl flex items-center gap-3 text-sm text-stone-700 dark:text-stone-300 shadow-sm transition-colors">
            <span class="text-xl">💡</span>
            <p><strong>Astuce :</strong> Clique sur l'icône <svg class="inline w-4 h-4 mx-0.5 text-stone-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle></svg> pour ouvrir la recette et accéder aux options de la recette (Texte, Partage ou PDF).</p>
        </div>`;
    }

    if(exact.length > 0) {
        allHtml += `<div class="animate-fade-in col-span-full text-xs font-black text-brand-600 dark:text-brand-500 uppercase tracking-widest mb-2 ml-2 flex items-center gap-2 mt-2"><span class="w-2 h-2 rounded-full bg-brand-500"></span> ${exact.length} Recette(s) Parfaite(s)</div>`;
        exact.forEach(r => allHtml += buildCard(r, prefix, false));
    }

    if(exact.length === 0 && alt.length > 0) {
        allHtml += `<div class="animate-fade-in col-span-full text-xs font-black text-amber-500 dark:text-amber-500 uppercase tracking-widest mb-2 ml-2 flex items-center gap-2 mt-2"><span class="w-2 h-2 rounded-full bg-amber-500"></span> Alternatives Proches</div>`;
        alt.slice(0,3).forEach(r => allHtml += buildCard(r, prefix, true));
    }

    if(exact.length === 0 && alt.length === 0) {
        allHtml = `<div class="animate-fade-in col-span-full p-4 bg-stone-100 dark:bg-stone-800 text-stone-500 dark:text-stone-400 border border-stone-200 dark:border-stone-700 rounded-2xl font-bold text-sm text-center shadow-inner transition-colors">Aucune recette possible. Ajustez les paramètres.</div>`;
    }

    container.innerHTML = allHtml;
    container.querySelectorAll('select').forEach(s => updateSim(s));
}

// Crée le composant HTML d'une carte de recette complète (avec données cachées pour l'export)
function buildCard(r, prefix, isAlt) {
    let bColor = isAlt ? 'border-amber-200 dark:border-amber-700/50 bg-amber-50 dark:bg-amber-900/20' : 'border-brand-200 dark:border-brand-700/50 bg-brand-50 dark:bg-brand-900/20';
    let tColor = isAlt ? 'text-amber-700 dark:text-amber-400' : 'text-brand-700 dark:text-brand-400';

    // FIX: Prendre correctement le VG à 100% (aromaPg = 0)
    let actualAromaPg = (r.aromaPg !== undefined && r.aromaPg !== null && !isNaN(r.aromaPg)) ? r.aromaPg : 100;
    let aromaWeight = getWeight(r.aroma, actualAromaPg);
    let totalWeight = aromaWeight;

    // On stocke les métadonnées dans des attributs HTML pour l'export plus tard
    let dataAttrs = `data-type="${prefix}" data-ratio="${formatRatioStr(r.realPgRatio, true)}" data-base-pg="${r.realPgRatio}" `;
    if (prefix === 't1') {
        let finalAroma = r.finalVol > 0 ? (r.aroma / r.finalVol) * 100 : 0;
        let bStr = parseFloat(document.getElementById('t1_booster_str').value) || 20;
        let finalNic = r.finalVol > 0 ? (r.nic * bStr) / r.finalVol : 0;
        dataAttrs += `data-aroma-perc="${round1(finalAroma)}" data-nic-mg="${round1(finalNic)}" `;
    } else if (prefix === 't2') {
        let finalAroma = r.finalVol > 0 ? (r.aroma / r.finalVol) * 100 : 0;
        let bStr = parseFloat(document.getElementById('t2_booster_str').value) || 20;
        dataAttrs += `data-aroma-perc="${round1(finalAroma)}" data-aroma-vol="${r.aroma}" data-nic-max="${r.nicMax}" data-prep-vol="${round1(r.prepVol)}" data-booster-str="${bStr}" `;
    }

    let html = `<div ${dataAttrs} class="animate-fade-in p-5 border ${bColor} rounded-3xl shadow-lg hover:shadow-xl hover:-translate-y-1 duration-300 flex flex-col h-full recipe-card-wrapper transition-all">`;
    
    html += `<div class="flex-1">`;
    html += `<div class="flex justify-between items-start mb-4 pb-3 border-b border-stone-200/60 dark:border-stone-700 transition-colors">
        <div>
            <div class="font-extrabold text-stone-800 dark:text-stone-100 text-lg leading-tight">${prefix==='t1'?'Liquide Prêt':'Base Shortfill'} <span class="text-brand-600 dark:text-brand-400">${round1(prefix==='t1'?r.finalVol:r.prepVol)} ml</span></div>
            <div class="mt-1.5"><span class="text-xs font-bold ${tColor} px-2 py-1 bg-white dark:bg-stone-800 rounded-lg shadow-sm transition-colors">${formatRatioStr(r.realPgRatio, true)}</span></div>
        </div>
        <button onclick="openModalFromCard(this)" class="p-2 text-stone-400 dark:text-stone-500 hover:text-brand-600 dark:hover:text-brand-400 bg-white dark:bg-stone-800 hover:bg-stone-50 dark:hover:bg-stone-700 rounded-xl transition-all shadow-sm ring-1 ring-stone-200/50 dark:ring-stone-700" title="Options de la recette">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1.5"></circle><circle cx="19" cy="12" r="1.5"></circle><circle cx="5" cy="12" r="1.5"></circle></svg>
        </button>
    </div>`;

    html += `<div class="space-y-2 mb-4">`;
    html += `
        <div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-50 dark:border-stone-700/50 transition-colors">
            <span class="text-sm font-bold text-brand-600 dark:text-brand-400 flex items-center gap-2">Arôme Concentré <span class="text-xs font-bold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900/50 px-1.5 py-0.5 rounded transition-colors">${formatRatioStr(actualAromaPg, false)}</span></span>
            <div class="text-right leading-tight">
                <span class="font-black text-stone-800 dark:text-stone-200">${round1(r.aroma)} ml</span>
                <span class="block text-xs font-bold text-brand-600 dark:text-brand-400 mt-0.5">${round1(aromaWeight)} g</span>
            </div>
        </div>`;
    
    r.bases.forEach(b => {
        if(b.vol > 0.1) {
            let baseWeight = getWeight(b.vol, b.pgRatio);
            totalWeight += baseWeight;
            html += `
                <div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-50 dark:border-stone-700/50 transition-colors">
                    <span class="text-sm font-bold text-stone-600 dark:text-stone-400 flex items-center gap-2">Base <span class="text-xs font-bold text-stone-600 dark:text-stone-300 bg-stone-100 dark:bg-stone-700 px-1.5 py-0.5 rounded transition-colors">${formatRatioStr(b.pgRatio, false)}</span></span>
                    <div class="text-right leading-tight">
                        <span class="font-black text-stone-800 dark:text-stone-200">${round1(b.vol)} ml</span>
                        <span class="block text-xs font-bold text-brand-600 dark:text-brand-400 mt-0.5">${round1(baseWeight)} g</span>
                    </div>
                </div>`;
        }
    });

    if(prefix === 't1' && r.nic > 0) {
        let nicWeight = getWeight(r.nic, r.nicRatio);
        totalWeight += nicWeight;
        html += `
            <div class="flex justify-between items-center bg-white dark:bg-stone-800 p-2.5 rounded-xl shadow-sm border border-stone-50 dark:border-stone-700/50 transition-colors">
                <span class="text-sm font-bold text-brand-600 dark:text-brand-500 flex items-center gap-2">Booster <span class="text-xs font-bold text-brand-700 dark:text-brand-300 bg-brand-100 dark:bg-brand-900/50 px-1.5 py-0.5 rounded transition-colors">${formatRatioStr(r.nicRatio, false)}</span></span>
                <div class="text-right leading-tight">
                    <span class="font-black text-stone-800 dark:text-stone-200">${round1(r.nic)} ml</span>
                    <span class="block text-xs font-bold text-brand-600 dark:text-brand-400 mt-0.5">${round1(nicWeight)} g</span>
                </div>
            </div>`;
    }
    html += `</div></div>`; 

    if(prefix === 't1') {
        let bStr = parseFloat(document.getElementById('t1_booster_str').value) || 20;
        let finalNic = r.finalVol > 0 ? (r.nic * bStr) / r.finalVol : 0;
        let finalAroma = r.finalVol > 0 ? (r.aroma / r.finalVol) * 100 : 0;
        html += `
        <div class="mt-auto pt-4 border-t border-stone-200/50 dark:border-stone-700 transition-colors">
            <div class="flex justify-between items-center">
                <span class="text-xs font-bold text-stone-500 dark:text-stone-400 uppercase tracking-widest">Taux finaux</span>
                <div class="text-right">
                    <span class="text-lg font-black text-brand-600 dark:text-brand-400">${round1(finalAroma)}%</span> <span class="text-xs text-stone-400 mr-1">arôme</span>
                    <span class="mx-1 text-stone-300 dark:text-stone-600">|</span>
                    <span class="text-lg font-black ${tColor}">${round1(finalNic)} mg/ml</span>
                </div>
            </div>
            <div class="text-right text-xs font-bold text-brand-600 dark:text-brand-400 mt-1">Poids total estimé : ${round1(totalWeight)} g</div>
        </div>`;
    }

    if(prefix === 't2') {
        html += `
        <div class="mt-auto border-t border-stone-200/50 dark:border-stone-700 pt-2 mb-2 text-right transition-colors">
            <span class="text-xs font-bold text-brand-600 dark:text-brand-400">Poids total estimé : ${round1(totalWeight)} g</span>
        </div>
        <div class="sim-container mt-1 p-3 bg-white dark:bg-stone-900/80 rounded-xl text-stone-800 dark:text-stone-200 text-xs border border-stone-200 dark:border-stone-700 shadow-sm transition-colors">
            <div class="flex items-center justify-center gap-2 mb-2 text-stone-500 dark:text-stone-400 font-bold text-[10px] uppercase tracking-widest border-b border-stone-200 dark:border-stone-700 pb-1.5 transition-colors">
                <span>🧪 Simulation d'ajout de boosters</span>
            </div>
            
            <div class="flex flex-col items-center gap-0.5 mb-3">
                <span class="text-[10px] font-bold text-stone-500 dark:text-stone-400">Je prélève</span>
                <select onchange="handlePreleveChange(this)" class="sim-sel-vol w-full max-w-[180px] bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-white rounded p-1 text-xs font-bold focus:outline-none border border-stone-200 dark:border-stone-700 text-center shadow-inner transition-colors">`;
                
        [10, 20, 30, 40, 50, 60, 70, 80, 90, 100].forEach(v => {
            html += `<option value="${v}" ${v===50 ? 'selected' : ''}>${v} ml</option>`;
        });

        html += `
                    <option value="${round1(r.prepVol)}">Total (${round1(r.prepVol)}ml)</option>
                    <option value="custom">Manuel...</option>
                </select>
                <div class="sim-custom-wrapper hidden items-center bg-stone-50 dark:bg-stone-800 rounded overflow-hidden border border-stone-200 dark:border-stone-700 shadow-inner mt-1 w-full max-w-[180px] transition-colors">
                    <button onclick="adjustCustomPreleve(this, -1)" class="btn-adjust-xs">-</button>
                    <input type="number" class="sim-custom-vol hide-arrows flex-1 min-w-0 w-full h-7 bg-stone-50 dark:bg-stone-800 text-stone-800 dark:text-white text-center text-xs font-bold focus:outline-none transition-colors" placeholder="ml" value="50" oninput="updateSim(this)">
                    <button onclick="adjustCustomPreleve(this, 1)" class="btn-adjust-xs">+</button>
                </div>
            </div>

            <div class="flex flex-col items-center mb-3 bg-stone-50 dark:bg-black/20 p-2 rounded-lg border border-stone-200 dark:border-stone-700/50 w-full max-w-[200px] mx-auto shadow-inner transition-colors">
                <div class="w-full flex justify-between items-center mb-2 px-1">
                    <span class="text-[10px] font-bold text-stone-500 dark:text-stone-400">Ratio des boosters:</span>
                    <select class="sim-b-ratio bg-white dark:bg-stone-800 text-stone-800 dark:text-white rounded px-1 py-0.5 text-[10px] font-bold focus:outline-none border border-stone-200 dark:border-stone-700 text-center shadow-sm transition-colors" onchange="updateSim(this)">
                        <option value="100">100% PG</option>
                        <option value="90">90/10</option>
                        <option value="80">80/20</option>
                        <option value="70">70/30</option>
                        <option value="60">60/40</option>
                        <option value="50" selected>50/50</option>
                        <option value="40">40/60</option>
                        <option value="30">30/70</option>
                        <option value="20">20/80</option>
                        <option value="10">10/90</option>
                        <option value="0">100% VG</option>
                    </select>
                </div>
                <span class="text-[10px] font-bold text-stone-500 dark:text-stone-400 mb-1">J'ajoute</span>
                
                <div class="flex items-center bg-white dark:bg-stone-800 rounded overflow-hidden border border-stone-200 dark:border-stone-700 shadow-sm transition-colors">
                    <button onclick="adjustSimBoosters(this, -1)" class="btn-adjust-xs">-</button>
                    <input type="number" value="2" step="0.1" min="0" oninput="syncSimInputs(this, 'boosters')" class="sim-b-count hide-arrows w-12 min-w-0 h-7 bg-white dark:bg-stone-800 text-stone-800 dark:text-white text-center text-xs font-bold focus:outline-none transition-colors">
                    <button onclick="adjustSimBoosters(this, 1)" class="btn-adjust-xs">+</button>
                </div>
                <span class="text-[10px] font-bold text-stone-500 dark:text-stone-400 mt-0.5">boosters</span>
                
                <span class="text-[9px] font-black text-stone-400 dark:text-stone-500 uppercase tracking-widest my-1">ou</span>
                
                <div class="flex items-center bg-white dark:bg-stone-800 rounded overflow-hidden border border-stone-200 dark:border-stone-700 shadow-sm transition-colors">
                    <button onclick="adjustSimMl(this, -1)" class="btn-adjust-xs">-</button>
                    <input type="number" value="20" step="1" min="0" oninput="syncSimInputs(this, 'ml')" class="sim-ml-count hide-arrows w-12 min-w-0 h-7 bg-white dark:bg-stone-800 text-stone-800 dark:text-white text-center text-xs font-bold focus:outline-none transition-colors">
                    <button onclick="adjustSimMl(this, 1)" class="btn-adjust-xs">+</button>
                </div>
                <span class="text-[10px] font-bold text-stone-500 dark:text-stone-400 mt-0.5">ml</span>
            </div>
            
            <div class="mt-3 text-center bg-stone-100 dark:bg-stone-800 p-2 rounded w-full border border-stone-200 dark:border-stone-700 transition-colors">
                <div class="text-[10px] font-bold text-stone-500 dark:text-stone-400">Résultat estimé :</div>
                <div class="text-sm font-black text-brand-600 dark:text-brand-400 sim-result">...</div>
            </div>
        </div>
    </div>`;
    }

    html += `</div>`;
    return html;
}


/* ========================================== */
/* 7. SYSTÈME DE SIMULATION (SHORTFILL)       */
/* ========================================== */

function handlePreleveChange(selectEl) {
    let wrapper = selectEl.parentElement.querySelector('.sim-custom-wrapper');
    if (selectEl.value === 'custom') {
        wrapper.classList.remove('hidden'); wrapper.classList.add('flex');
    } else {
        wrapper.classList.add('hidden'); wrapper.classList.remove('flex');
    }
    updateSim(selectEl);
}

function adjustCustomPreleve(btn, step) {
    let input = btn.parentElement.querySelector('input');
    let val = parseFloat(input.value) || 0;
    input.value = Math.max(0, val + step);
    updateSim(input);
}

function adjustSimBoosters(btn, step) {
    let input = btn.parentElement.querySelector('input');
    let val = parseFloat(input.value) || 0;
    input.value = Math.max(0, val + step);
    syncSimInputs(input, 'boosters');
}

function adjustSimMl(btn, step) {
    let input = btn.parentElement.querySelector('input');
    let val = parseFloat(input.value) || 0;
    input.value = Math.max(0, val + step);
    syncSimInputs(input, 'ml');
}

function syncSimInputs(inputEl, source) {
    let container = inputEl.closest('.sim-container');
    let bInput = container.querySelector('.sim-b-count');
    let mlInput = container.querySelector('.sim-ml-count');
    
    if (source === 'boosters') {
        let count = parseFloat(bInput.value) || 0;
        mlInput.value = round1(count * 10);
    } else {
        let ml = parseFloat(mlInput.value) || 0;
        bInput.value = round1(ml / 10);
    }
    updateSim(inputEl);
}

// Met à jour le texte du résultat de la simulation dans la carte Shortfill
function updateSim(el) {
    let container = el.closest('.recipe-card-wrapper');
    if(!container) return;
    
    let sel = container.querySelector('.sim-sel-vol');
    let customInp = container.querySelector('.sim-custom-vol');
    let bCountInp = container.querySelector('.sim-b-count');
    let resEl = container.querySelector('.sim-result');
    let bRatioSel = container.querySelector('.sim-b-ratio');
    
    if(!sel || !bCountInp || !resEl) return;

    let preleveVol = sel.value === 'custom' ? (parseFloat(customInp.value) || 0) : (parseFloat(sel.value) || 0);

    let bCount = parseFloat(bCountInp.value) || 0;
    let bStr = parseFloat(document.getElementById('t2_booster_str').value) || 20;
    let maxNic = parseFloat(container.getAttribute('data-nic-max')) || 0;
    let totalAroma = parseFloat(container.getAttribute('data-aroma-vol')) || 0;
    let prepVolAttr = parseFloat(container.getAttribute('data-prep-vol')) || 0;
    let basePg = parseFloat(container.getAttribute('data-base-pg')) || 50;
    let bPg = bRatioSel ? parseFloat(bRatioSel.value) : 50;
    
    let bVol = bCount * 10;
    let finalVol = preleveVol + bVol;
    let aromaInSample = preleveVol * (totalAroma / prepVolAttr);
    
    if (finalVol > 0) {
        let finalNic = (bVol * bStr) / finalVol;
        let finalAromaPerc = (aromaInSample / finalVol) * 100;
        let finalPgRatio = ((preleveVol * (basePg / 100)) + (bVol * (bPg / 100))) / finalVol * 100;
        
        let aromaHtml = `<br><span class="text-[10px] text-stone-500 dark:text-stone-400 font-bold mt-1 inline-block">Arôme dilué à ${round1(finalAromaPerc)}% | Ratio final: ${formatRatioStr(finalPgRatio)}</span>`;

        if (finalNic > maxNic) {
            resEl.innerHTML = `${round1(finalVol)} ml à <span class="text-brand-600 dark:text-brand-400">${round1(finalNic)} mg/ml</span>${aromaHtml}<br><span class="text-[10px] text-red-500 dark:text-red-400 font-bold block mt-1 leading-tight">⚠️ Taux max (${maxNic} mg) dépassé,<br>arôme trop dilué !</span>`;
        } else {
            resEl.innerHTML = `${round1(finalVol)} ml à <span class="text-brand-600 dark:text-brand-400">${round1(finalNic)} mg/ml</span>${aromaHtml}`;
        }
    } else {
        resEl.innerText = "0 ml";
    }
}


/* ========================================== */
/* 8. GESTION DES MODALES (AIDE, CALCULATRICE)*/
/* ========================================== */

function openCalcModal() { document.getElementById('calc_modal').classList.remove('hidden'); }
function closeCalcModal() { document.getElementById('calc_modal').classList.add('hidden'); }
function openHelpModal() { document.getElementById('help_modal').classList.remove('hidden'); }
function closeHelpModal() { document.getElementById('help_modal').classList.add('hidden'); }

// Fonctions pour la Calculatrice Rapide
function updateCalcDisplay() { document.getElementById('calc_display').innerText = calcExpr || "0"; }
function calcAppend(val) {
    if (calcExpr === "Erreur") calcExpr = "";
    calcExpr += val; updateCalcDisplay();
}
function calcClear() { calcExpr = ""; updateCalcDisplay(); }
function calcResult() {
    try {
        let evalExpr = calcExpr.replace(/×/g, '*').replace(/÷/g, '/');
        let res = new Function('return ' + evalExpr)();
        if (isNaN(res) || !isFinite(res)) throw new Error("Erreur");
        calcExpr = (Math.round(res * 1000) / 1000).toString();
        updateCalcDisplay();
    } catch(e) {
        calcExpr = "Erreur"; updateCalcDisplay(); setTimeout(calcClear, 1000);
    }
}

// Touche Echap pour fermer les modales
document.addEventListener('keydown', function(event) {
    if (event.key === "Escape") {
        let eeModal = document.getElementById('easter_egg_modal');
        if (!eeModal.classList.contains('hidden')) { return; } // On ne ferme pas la self-destruct au pif
        
        let idModal = document.getElementById('agent_identity_modal');
        if (!idModal.classList.contains('hidden')) { closeIdentityModal(); return; }

        let exportModal = document.getElementById('export_prompt_modal');
        if (!exportModal.classList.contains('hidden')) { cancelExport(); return; }
        let recipeModal = document.getElementById('recipe_modal');
        if (!recipeModal.classList.contains('hidden')) { closeRecipeModal(); return; }
        let helpModal = document.getElementById('help_modal');
        if (!helpModal.classList.contains('hidden')) { closeHelpModal(); return; }
        let calcModal = document.getElementById('calc_modal');
        if (!calcModal.classList.contains('hidden')) { closeCalcModal(); return; }
        let shareFlyerModal = document.getElementById('share_flyer_modal');
        if (!shareFlyerModal.classList.contains('hidden')) { closeShareFlyerModal(); }
    }
});


/* ========================================== */
/* 9. EXPORT & PARTAGE (TEXTE, PDF, MODALES)  */
/* ========================================== */

let currentRecipeCard = null;

// Ouvre la carte en plein écran (modale) pour accéder à l'export
function openModalFromCard(btn) {
    let card = btn.closest('.recipe-card-wrapper');
    currentRecipeCard = card;
    
    let clone = card.cloneNode(true);
    let optBtn = clone.querySelector('button');
    if(optBtn) optBtn.remove();
    
    clone.classList.remove('hover:shadow-xl', 'hover:-translate-y-1', 'h-full', 'dark:bg-brand-900/20', 'dark:bg-amber-900/20');
    clone.classList.add('export-card', 'relative', 'w-full', 'shadow-2xl', 'dark:bg-stone-800', 'max-h-[85vh]', 'overflow-y-auto', 'hide-scrollbar');
    
    let buttonsHtml = `
        <div class="modal-buttons flex justify-between gap-3 mt-6 pt-4 border-t border-stone-200 dark:border-stone-700 print:hidden">
            <button onclick="closeRecipeModal()" class="px-5 py-2.5 bg-stone-100 dark:bg-stone-700 hover:bg-stone-200 dark:hover:bg-stone-600 text-stone-700 dark:text-stone-200 font-bold text-sm rounded-xl transition-colors">Fermer</button>
            <button onclick="openExportPrompt()" class="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-bold text-sm rounded-xl transition-colors shadow-sm flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>
                Exporter
            </button>
        </div>
    `;
    clone.innerHTML += buttonsHtml;
    
    let sourceSimSel = card.querySelector('.sim-sel-vol');
    if(sourceSimSel) {
        let cloneSimSel = clone.querySelector('.sim-sel-vol');
        cloneSimSel.value = sourceSimSel.value;
        handlePreleveChange(cloneSimSel);
        if(sourceSimSel.value === 'custom') {
            clone.querySelector('.sim-custom-vol').value = card.querySelector('.sim-custom-vol').value;
        }
    }
    let sourceBRatio = card.querySelector('.sim-b-ratio');
    if(sourceBRatio) clone.querySelector('.sim-b-ratio').value = sourceBRatio.value;
    
    let sourceBCount = card.querySelector('.sim-b-count');
    let sourceMlCount = card.querySelector('.sim-ml-count');
    if(sourceBCount) clone.querySelector('.sim-b-count').value = sourceBCount.value;
    if(sourceMlCount) clone.querySelector('.sim-ml-count').value = sourceMlCount.value;
    
    let modalContent = document.getElementById('recipe_modal_content');
    modalContent.innerHTML = '';
    modalContent.appendChild(clone);
    
    document.getElementById('recipe_modal').classList.remove('hidden');
    let sel = clone.querySelector('.sim-sel-vol');
    if(sel) updateSim(sel);
}

function closeRecipeModal() {
    document.getElementById('recipe_modal').classList.add('hidden');
    currentRecipeCard = null;
}

function showPdfOptions() {
    document.getElementById('export_step_1').classList.add('hidden');
    document.getElementById('export_step_2').classList.remove('hidden');
    document.getElementById('export_step_2').classList.add('flex');
    document.getElementById('btn_back_export').classList.remove('hidden');
}

function hidePdfOptions() {
    document.getElementById('export_step_1').classList.remove('hidden');
    document.getElementById('export_step_2').classList.add('hidden');
    document.getElementById('export_step_2').classList.remove('flex');
    document.getElementById('btn_back_export').classList.add('hidden');
}

function openExportPrompt() {
    if (pendingNewRecipe) {
        document.getElementById('recipe_name_input').value = '';
        pendingNewRecipe = false;
    }
    document.getElementById('export_prompt_modal').classList.remove('hidden');
    document.getElementById('recipe_name_input').focus();
}

function cancelExport() {
    document.getElementById('export_prompt_modal').classList.add('hidden');
    hidePdfOptions();
}

// Génère le texte formaté pour copier/coller
function getRecipeText() {
    if (!currentRecipeCard) return "";
    
    let name = document.getElementById('recipe_name_input').value.trim() || "Ma Recette DIY";
    let text = `🧪 ${name}\n-----------------\n`;
    
    let clone = document.getElementById('recipe_modal_content').querySelector('.export-card');
    let type = clone.getAttribute('data-type');
    let ratio = clone.getAttribute('data-ratio');
    let aromaPerc = clone.getAttribute('data-aroma-perc');
    let basePg = parseFloat(clone.getAttribute('data-base-pg')) || 50;
    
    let titleEl = clone.querySelector('.font-extrabold.text-lg');
    if(titleEl) text += `${titleEl.innerText.replace(/\n/g, ' ')}\n`;
    if (ratio) text += `⚖️ Ratio : ${ratio}\n`;
    
    text += `\n📝 INGRÉDIENTS :\n`;
    
    let rows = clone.querySelectorAll('.bg-white.dark\\:bg-stone-800.p-2\\.5');
    rows.forEach(row => {
        let nameNode = row.querySelector('.text-sm');
        let name = nameNode.innerText.replace(/\n/g, ' ').replace(' Concentré', '').trim();
        let vols = row.querySelector('.text-right').innerText.split('\n');
        let ml = vols[0].trim();
        let g = vols.length > 1 ? ` (${vols[1].trim()})` : '';
        text += `- ${name}: ${ml}${g}\n`;
    });
    
    if (type === 't1') {
        text += `\n🎯 RÉSULTAT :\n- Arôme : ${aromaPerc}%\n`;
        let nicMg = clone.getAttribute('data-nic-mg');
        text += `- Nicotine : ${nicMg} mg/ml\n`;
    } else if (type === 't2') {
        let nicMax = parseFloat(clone.getAttribute('data-nic-max'));
        let prepVol = parseFloat(clone.getAttribute('data-prep-vol'));
        let bStr = parseFloat(clone.getAttribute('data-booster-str'));
        let totalAroma = parseFloat(clone.getAttribute('data-aroma-vol')) || 0;
        
        let aromaBeforeBoost = prepVol > 0 ? round1((totalAroma / prepVol) * 100) : 0;
        
        text += `\n🎯 RÉSULTAT (Avant boost) :\n- Arôme surdosé : ${aromaBeforeBoost}%\n`;
        text += `- Cibles après boost : ${aromaPerc}% d'arôme | ${nicMax} mg/ml max\n`;
        
        let bRatioSel = clone.querySelector('.sim-b-ratio');
        let bPg = bRatioSel ? parseFloat(bRatioSel.value) : 50;
        
        function getGuideForVol(baseVol, title) {
            let aromaVolInSample = baseVol * (totalAroma / prepVol);
            let out = `\n💡 GUIDE DE BOOST AVEC RATIO ${formatRatioStr(bPg)}\n(${title}) :\n`;
            let targets = [3, 6, 9, 12];
            let sims = new Map();
            
            targets.forEach(target => {
                if (target < nicMax) {
                    let exactBVol = (baseVol * target) / (bStr - target);
                    let bCount = Math.round(exactBVol / 10);
                    if (bCount > 0) {
                        let actualVol = bCount * 10;
                        let actualNic = (actualVol * bStr) / (baseVol + actualVol);
                        let finalAromaPerc = (aromaVolInSample / (baseVol + actualVol)) * 100;
                        let finalPg = ((baseVol * (basePg/100)) + (actualVol * (bPg/100))) / (baseVol + actualVol) * 100;
                        sims.set(bCount, {nic: actualNic, aroma: finalAromaPerc, pg: finalPg});
                    }
                }
            });
            
            sims.forEach((data, bCount) => {
                out += `+ ${bCount} boost. (${round1(bCount*10)}ml)\n  > Nic: ~${round1(data.nic)} mg\n  > Arôme: ~${round1(data.aroma)} %\n  > Ratio final: ~${formatRatioStr(data.pg)}\n`;
            });
            
            let exactMaxBVol = (baseVol * nicMax) / (bStr - nicMax);
            let maxBCount = exactMaxBVol / 10;
            let roundedMax = round1(maxBCount);
            let floorMax = Math.floor(maxBCount);
            
            if (floorMax > 0 && floorMax < roundedMax && !sims.has(floorMax)) {
                let actualNicFloor = (floorMax * 10 * bStr) / (baseVol + floorMax * 10);
                let finalAromaPercFloor = (aromaVolInSample / (baseVol + floorMax * 10)) * 100;
                let finalPgFloor = ((baseVol * (basePg/100)) + (floorMax * 10 * (bPg/100))) / (baseVol + floorMax * 10) * 100;
                out += `+ ${floorMax} boost. (${round1(floorMax*10)}ml)\n  > Nic: ~${round1(actualNicFloor)} mg\n  > Arôme: ~${round1(finalAromaPercFloor)} %\n  > Ratio final: ~${formatRatioStr(finalPgFloor)}\n`;
            }
            
            let maxAromaPerc = (aromaVolInSample / (baseVol + exactMaxBVol)) * 100;
            let maxFinalPg = ((baseVol * (basePg/100)) + (exactMaxBVol * (bPg/100))) / (baseVol + exactMaxBVol) * 100;
            out += `+ MAX ${roundedMax} boost. (${round1(roundedMax*10)}ml)\n  > Nic: ${nicMax} mg\n  > Arôme: ${round1(maxAromaPerc)} %\n  > Ratio final: ~${formatRatioStr(maxFinalPg)}\n`;
            return out;
        }

        text += getGuideForVol(prepVol, "bidon complet " + round1(prepVol) + " ml");
        if (50 < prepVol) text += getGuideForVol(50, "si prélèvement 50 ml");
        
        let simSel = clone.querySelector('.sim-sel-vol');
        let customPreleveVol = (simSel.value === 'custom') ? (parseFloat(clone.querySelector('.sim-custom-vol').value) || 0) : (parseFloat(simSel.value) || 0);
        let customBCount = parseFloat(clone.querySelector('.sim-b-count').value) || 0;
        
        if (customPreleveVol > 0 && customBCount > 0) {
            let actualNic = (customBCount * 10 * bStr) / (customPreleveVol + customBCount * 10);
            let aromaVolInSample = customPreleveVol * (totalAroma / prepVol);
            let finalAromaPerc = (aromaVolInSample / (customPreleveVol + customBCount * 10)) * 100;
            let customFinalPg = ((customPreleveVol * (basePg/100)) + (customBCount * 10 * (bPg/100))) / (customPreleveVol + customBCount * 10) * 100;
            
            let customLine = `+ ${customBCount} boost. (${round1(customBCount*10)}ml)\n  > Nic: ~${round1(actualNic)} mg\n  > Arôme: ~${round1(finalAromaPerc)} %\n  > Ratio final: ~${formatRatioStr(customFinalPg)}\n`;
            
            if (!text.includes(customLine)) {
                text += `\n💡 GUIDE PERSONNALISÉ RATIO ${formatRatioStr(bPg)}\n(pour ${round1(customPreleveVol)} ml) :\n${customLine}`;
                if (actualNic > nicMax) text += `⚠️ ATTENTION : Taux max dépassé !\n`;
            }
        }
    }

    if (agentIdentity) {
        text += `\nCette recette a été partagée par ${agentIdentity}\n`;
    }
    
    text += `\n-----------------\nL'app Je-DIY :\nhttps://lehcimcramtrebor.github.io/jediy/`;
    return text;
}

function copyRecipeText() {
    let text = getRecipeText();
    navigator.clipboard.writeText(text).then(() => {
        let btn = document.getElementById('btn_copy_text');
        let originalHtml = btn.innerHTML;
        btn.innerHTML = `<svg class="mb-2 text-brand-500" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg><span class="text-[10px] font-bold text-brand-500">Copié !</span>`;
        setTimeout(() => { btn.innerHTML = originalHtml; }, 2000);
    }).catch(err => console.error("Erreur copie", err));
}

function shareRecipeText() {
    let text = getRecipeText();
    if (navigator.share) {
        navigator.share({ title: 'Recette E-Liquide', text: text }).catch((err) => console.log('Partage annulé', err));
    } else { copyRecipeText(); }
}

// --- GÉNÉRATION DU PDF ---

let generatedSignatures = new Set(); // Pour le système shortfill PDF

function computeBoostGuide(baseVol, totalAroma, prepVol, nicMax, bStr, basePg, bPg) {
    let aromaVolInSample = baseVol * (totalAroma / prepVol);
    let targets = [3, 6, 9, 12];
    let sims = new Map();
    
    targets.forEach(target => {
        if (target < nicMax) {
            let exactBVol = (baseVol * target) / (bStr - target);
            let bCount = Math.round(exactBVol / 10);
            if (bCount > 0) {
                let actualVol = bCount * 10;
                let actualNic = (actualVol * bStr) / (baseVol + actualVol);
                let finalAromaPerc = (aromaVolInSample / (baseVol + actualVol)) * 100;
                let finalPg = ((baseVol * (basePg/100)) + (actualVol * (bPg/100))) / (baseVol + actualVol) * 100;
                sims.set(bCount, { nic: actualNic, aroma: finalAromaPerc, pg: finalPg });
            }
        }
    });
    
    let exactMaxBVol = (baseVol * nicMax) / (bStr - nicMax);
    let maxBCount = exactMaxBVol / 10;
    let roundedMax = round1(maxBCount);
    let floorMax = Math.floor(maxBCount);
    
    if (floorMax > 0 && floorMax < roundedMax && !sims.has(floorMax)) {
        let actualNicFloor = (floorMax * 10 * bStr) / (baseVol + floorMax * 10);
        let finalAromaPercFloor = (aromaVolInSample / (baseVol + floorMax * 10)) * 100;
        let finalPgFloor = ((baseVol * (basePg/100)) + (floorMax * 10 * (bPg/100))) / (baseVol + floorMax * 10) * 100;
        sims.set(floorMax, { nic: actualNicFloor, aroma: finalAromaPercFloor, pg: finalPgFloor, isFloorMax: true });
    }
    
    let maxAromaPerc = (aromaVolInSample / (baseVol + exactMaxBVol)) * 100;
    let maxFinalPg = ((baseVol * (basePg/100)) + (exactMaxBVol * (bPg/100))) / (baseVol + exactMaxBVol) * 100;
    sims.set(roundedMax, { nic: nicMax, aroma: maxAromaPerc, pg: maxFinalPg, isMax: true });
    
    let results = Array.from(sims, ([bCount, data]) => ({ bCount, ...data }));
    results.sort((a, b) => a.bCount - b.bCount);
    return results;
}

function getGuideHtmlForVol(baseVol, title, totalAroma, prepVol, bStr, nicMax, basePg, bPg) {
    let data = computeBoostGuide(baseVol, totalAroma, prepVol, nicMax, bStr, basePg, bPg);
    let html = `
        <div class="p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-700 text-[10px] leading-tight break-inside-avoid">
            <div class="font-black uppercase tracking-widest text-stone-500 mb-1 border-b border-stone-200 pb-1 flex items-center gap-2">
                <span>💡 ${title}</span>
                <span class="text-[8px] bg-stone-200 px-1.5 py-0.5 rounded">${round1(baseVol)} ml</span>
            </div>
            <table class="w-full text-left font-medium mt-1">
    `;
    data.forEach(row => {
        generatedSignatures.add(`${baseVol}-${row.bCount}`);
        let isMax = row.isMax;
        let warning = (row.nic > nicMax) ? `<span class="text-red-500 font-bold text-[8px] ml-1">⚠️ Max dépassé</span>` : '';
        let trClass = isMax ? "text-brand-700 font-bold" : "text-stone-600";
        let prefix = isMax ? "MAX: " : "+ ";
        let mlText = round1(row.bCount * 10);
        html += `
            <tr class="${trClass} border-b border-stone-100/50 last:border-0">
                <td class="py-1 align-middle whitespace-nowrap pr-2">${prefix}${row.bCount} boost. <span class="text-[8px] opacity-70">(${mlText}ml)</span></td>
                <td class="py-1 align-middle whitespace-nowrap pr-2">-> ${isMax ? '' : '~'}${round1(row.nic)} mg</td>
                <td class="py-1 align-middle text-right">
                    Arôme: ${isMax ? '' : '~'}${round1(row.aroma)}%<br>
                    <span class="text-[8px] text-stone-400 font-bold">Boosters: ${formatRatioStr(bPg)}</span><br>
                    <span class="text-[8px] text-stone-400 font-bold">Ratio final: ~${formatRatioStr(row.pg)}</span> 
                    ${warning}
                </td>
            </tr>
        `;
    });
    html += `</table></div>`;
    return html;
}

// Modifie temporairement la carte pour que l'export PDF soit parfait
function prepareCardForExport() {
    let clone = document.getElementById('recipe_modal_content').querySelector('.export-card');
    if (!clone) return null;
    
    clone.classList.remove('max-h-[85vh]', 'overflow-y-auto', 'hide-scrollbar');
    
    let name = document.getElementById('recipe_name_input').value.trim() || "Recette personnalisée";

    let headerDiv = document.createElement('div');
    headerDiv.className = 'export-title text-center mb-3 pb-3 border-b-2 border-stone-200';

    // Injection du titre du site + nom de la recette
    headerDiv.innerHTML = `
        <div class="text-3xl font-black text-stone-800 tracking-tight mb-1">Je-<span class="text-brand-600">DIY</span></div>
        <div class="text-lg font-bold text-stone-500">${name}</div>
    `;

    clone.insertBefore(headerDiv, clone.firstChild);            
    
    let buttons = clone.querySelector('.modal-buttons');
    if (buttons) buttons.style.display = 'none';

    let simContainer = clone.querySelector('.sim-container');
    let cleanSimDiv = null;
    if (simContainer) {
        let type = clone.getAttribute('data-type');
        if (type === 't2') {
            let bStr = parseFloat(clone.getAttribute('data-booster-str')) || 20;
            let totalAroma = parseFloat(clone.getAttribute('data-aroma-vol')) || 0;
            let prepVolAttr = parseFloat(clone.getAttribute('data-prep-vol')) || 0;
            let maxNic = parseFloat(clone.getAttribute('data-nic-max')) || 0;
            let basePg = parseFloat(clone.getAttribute('data-base-pg')) || 50;
            
            let bRatioSel = clone.querySelector('.sim-b-ratio');
            let bPg = bRatioSel ? parseFloat(bRatioSel.value) : 50;

            generatedSignatures.clear(); 

            cleanSimDiv = document.createElement('div');
            cleanSimDiv.className = 'mt-3 flex flex-col gap-2 w-full pdf-guides';
            
            let guidesHtml = getGuideHtmlForVol(prepVolAttr, `Bidon Complet (Boosters ${formatRatioStr(bPg)})`, totalAroma, prepVolAttr, bStr, maxNic, basePg, bPg);
            if (prepVolAttr > 50) guidesHtml += getGuideHtmlForVol(50, "Prélèvement", totalAroma, prepVolAttr, bStr, maxNic, basePg, bPg);
            
            let sel = clone.querySelector('.sim-sel-vol');
            let customPreleveVol = sel.value === 'custom' ? (parseFloat(clone.querySelector('.sim-custom-vol').value) || 0) : (parseFloat(sel.value) || 0);
            let customBCount = parseFloat(clone.querySelector('.sim-b-count').value) || 0;
            
            if (customPreleveVol > 0 && customBCount > 0) {
                let sig = `${customPreleveVol}-${customBCount}`;
                if (!generatedSignatures.has(sig)) {
                    let actualNic = (customBCount * 10 * bStr) / (customPreleveVol + customBCount * 10);
                    let aromaVolInSample = customPreleveVol * (totalAroma / prepVolAttr);
                    let finalAromaPerc = (aromaVolInSample / (customPreleveVol + customBCount * 10)) * 100;
                    let customFinalPg = ((customPreleveVol * (basePg/100)) + (customBCount * 10 * (bPg/100))) / (customPreleveVol + customBCount * 10) * 100;
                    
                    let warning = actualNic > maxNic;
                    let customMlText = round1(customBCount * 10);
                    
                    guidesHtml += `
                    <div class="p-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-700 text-[10px] leading-tight break-inside-avoid">
                        <div class="font-black uppercase tracking-widest text-stone-500 mb-1 border-b border-stone-200 pb-1 flex items-center gap-2">
                            <span>💡 Personnalisé</span>
                            <span class="text-[8px] bg-stone-200 text-stone-700 px-1.5 py-0.5 rounded">${round1(customPreleveVol)} ml</span>
                        </div>
                        <table class="w-full text-left font-medium mt-1">
                            <tr class="border-b border-stone-100/50 last:border-0">
                                <td class="py-1 align-middle whitespace-nowrap pr-2">+ ${customBCount} boost. <span class="text-[8px] opacity-70">(${customMlText}ml)</span></td>
                                <td class="py-1 align-middle whitespace-nowrap pr-2">-> ~${round1(actualNic)} mg</td>
                                <td class="py-1 align-middle text-right">
                                    Arôme: ~${round1(finalAromaPerc)}%<br>
                                    <span class="text-[8px] text-stone-400 font-bold">Boosters: ${formatRatioStr(bPg)}</span><br>
                                    <span class="text-[8px] text-stone-400 font-bold">Ratio final: ~${formatRatioStr(customFinalPg)}</span>
                                    ${warning ? '<span class="text-red-500 font-bold text-[8px] ml-1">⚠️ Max dépassé</span>' : ''}
                                </td>
                            </tr>
                        </table>
                    </div>`;
                }
            }

            cleanSimDiv.innerHTML = guidesHtml;
            simContainer.style.display = 'none';
            simContainer.parentNode.insertBefore(cleanSimDiv, simContainer.nextSibling);
        }
    }

    let footerDiv = document.createElement('div');
    footerDiv.className = 'export-footer flex items-center justify-center gap-4 mt-6 pt-4 border-t-2 border-stone-100';
    
    let footerText = agentIdentity 
        ? `Cette recette a été partagée par <span class="text-brand-600 font-black text-base">${agentIdentity}</span>`
        : `Scanne ce code pour réaliser tes propres calculs<br><span class="text-brand-600 font-black text-base">Je-DIY</span>`;

    footerDiv.innerHTML = `
        <img src="jediy.png" alt="QR Code Je-DIY" class="w-20 h-20 rounded-xl shadow-sm border border-stone-200" onerror="this.src='https://placehold.co/80x80/e2e8f0/475569?text=Je-DIY'">
        <div class="text-stone-500 font-bold text-xs text-left leading-tight">${footerText}</div>
    `;
    clone.appendChild(footerDiv);
    
    document.body.classList.add('exporting');
    document.documentElement.classList.remove('dark');
    
    return {
        card: clone,
        restore: () => {
            document.body.classList.remove('exporting');
            applyTheme(); 
            let addedTitle = clone.querySelector('.export-title');
            if (addedTitle) addedTitle.remove();
            let addedFooter = clone.querySelector('.export-footer');
            if (addedFooter) addedFooter.remove();
            
            clone.classList.add('max-h-[85vh]', 'overflow-y-auto', 'hide-scrollbar');
            
            if (cleanSimDiv) cleanSimDiv.remove();
            if (simContainer) simContainer.style.display = '';
            if (buttons) buttons.style.display = ''; 
        }
    };
}

// Exécute html2pdf avec la carte préparée
function exportRecipePDF(action) {
    let ctx = prepareCardForExport();
    if (!ctx) return;
    
    let name = document.getElementById('recipe_name_input').value.trim() || "recette";
    let filename = `${name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.pdf`;
    
    setTimeout(() => {
        let opt = {
            margin:       [5, 5, 5, 5], // Réduction des marges pour gagner de la place
            filename:     filename,
            image:        { type: 'jpeg', quality: 0.95 },
            html2canvas:  { 
                scale: 2, 
                useCORS: true, 
                scrollY: 0, 
                backgroundColor: '#ffffff',
                windowWidth: document.documentElement.offsetWidth 
            },
            jsPDF:        { unit: 'mm', format: 'a4', orientation: 'portrait' },
            pagebreak:    { mode: 'avoid' } // Évite autant que possible de couper en plein milieu
        };

        let worker = html2pdf().set(opt).from(ctx.card);

        if (action === 'download') {
            worker.save().then(() => {
                ctx.restore();
                cancelExport();
            }).catch(err => { console.error("Erreur PDF:", err); ctx.restore(); });
        } else if (action === 'share') {
            worker.output('blob').then(pdfBlob => {
                let file = new File([pdfBlob], filename, { type: 'application/pdf' });
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    navigator.share({
                        files: [file], title: name,
                        text: 'Voici ma recette E-Liquide générée avec Je-DIY.\nhttps://lehcimcramtrebor.github.io/jediy/'
                    }).then(() => { ctx.restore(); cancelExport(); }).catch(err => { console.log('Partage annulé', err); ctx.restore(); });
                } else {
                    alert("Le partage de fichier n'est pas supporté par votre navigateur. Le fichier va être téléchargé à la place.");
                    worker.save().then(() => { ctx.restore(); cancelExport(); });
                }
            }).catch(err => { console.error("Erreur Blob PDF:", err); ctx.restore(); });
        }
    }, 300);
}

// Partage du lien complet de l'app (Flyer QR Code)
function shareApp() { document.getElementById('share_flyer_modal').classList.remove('hidden'); }
function closeShareFlyerModal() { document.getElementById('share_flyer_modal').classList.add('hidden'); }

function executeShare() {
    let shareText = 'Découvre Je-DIY, le calculateur expert de e-liquide super pratique pour la vape !';
    if (agentIdentity) {
        shareText = `Cette application a été partagée par ${agentIdentity}. ` + shareText;
    }

    const shareData = {
        title: 'Je-DIY - Calculateur Expert',
        text: shareText,
        url: 'https://lehcimcramtrebor.github.io/jediy/'
    };

    if (navigator.share) {
        navigator.share(shareData).catch((err) => console.log('Partage annulé ou erreur', err));
    } else {
        const textArea = document.createElement("textarea");
        textArea.value = shareData.url;
        document.body.appendChild(textArea);
        textArea.select();
        try {
            document.execCommand('copy');
            const btn = document.getElementById('share_app_btn');
            const originalHTML = btn.innerHTML;
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-brand-500"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            setTimeout(() => { btn.innerHTML = originalHTML; }, 2000);
            closeShareFlyerModal();
        } catch (err) { console.error('Copie échouée', err); }
        document.body.removeChild(textArea);
    }
}

/* ========================================== */
/* 10. PWA ET SERVICE WORKER                  */
/* ========================================== */

let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('install_app_btn');
    if (installBtn) {
        installBtn.classList.remove('hidden');
        installBtn.classList.add('flex');
    }
});

function installApp() {
    const installBtn = document.getElementById('install_app_btn');
    installBtn.classList.add('hidden');
    installBtn.classList.remove('flex');
    if (deferredPrompt) {
        deferredPrompt.prompt();
        deferredPrompt.userChoice.then(() => { deferredPrompt = null; });
    }
}

window.addEventListener('appinstalled', () => {
    const installBtn = document.getElementById('install_app_btn');
    if (installBtn) { installBtn.classList.add('hidden'); installBtn.classList.remove('flex'); }
});

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(registration => { console.log('ServiceWorker enregistré avec succès.', registration.scope); })
            .catch(error => { console.log('Erreur d\'enregistrement du ServiceWorker:', error); });
    });
}
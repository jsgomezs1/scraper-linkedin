let isSearching = false;
let shouldStop = false;
let profilesFound = [];
let currentProfileIndex = 0;
let maxProfiles = 10;
let searchTabId = null;
let lastSearchTime = 0;
const MIN_DELAY_BETWEEN_ACTIONS = 2000; // 2 segundos mínimo entre acciones

// El Service Worker se mantiene activo para gestionar peticiones en segundo plano
chrome.runtime.onInstalled.addListener(function() {
  console.log('LinkedIn Profile Scraper Local instalado correctamente');
  
  // Inicializar almacenamiento para perfiles guardados (puede ser útil para manual también)
  chrome.storage.local.get(['profiles'], function(result) {
    if (!result.profiles) {
      chrome.storage.local.set({profiles: []});
      console.log('Almacenamiento inicializado con array vacío de perfiles');
    } else {
      console.log(`Almacenamiento existente con ${result.profiles.length} perfiles`);
    }
  });
  
  // Verificar si hay una búsqueda en progreso guardada
  chrome.storage.local.get(['searchInProgress'], function(result) {
    if (result.searchInProgress) {
      console.log('Recuperando búsqueda en progreso:', result.searchInProgress);
      
      // Podríamos reanudar la búsqueda aquí, pero es más seguro dejar que el usuario 
      // la reinicie desde el popup para evitar comportamientos inesperados
    }
  });
});

// Gestionar la descarga de archivos
chrome.downloads.onChanged.addListener(function(downloadDelta) {
  if (downloadDelta.state && downloadDelta.state.current === "complete") {
    console.log("Descarga completada con ID: " + downloadDelta.id);
  }
});

// Parte de background.js que maneja la solicitud a Supabase
chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "sendToSupabase") {
    console.log('Background: Recibida solicitud para enviar a Supabase', request);
    
    const supabaseUrl = request.url || 'https://qiqxywhaggmjrbtvkanm.supabase.co/functions/v1/generate-embedding';
    // const supabaseToken = '...'; // Token is hardcoded in fetch
    
    if (!request.payload) {
      console.error('Background: Payload incorrecto');
      sendResponse({ 
        success: false, 
        error: 'Estructura de datos incorrecta.'
      });
      return true;
    }
    
    if (!request.payload.summary) {
      console.warn('Background: Campo summary faltante, agregando valor por defecto');
      request.payload.summary = "Sin información de resumen disponible";
    }
    
    console.log('Background: Enviando payload a Supabase:', JSON.stringify(request.payload, null, 2));
    
    fetch(supabaseUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Authorization': 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFpcXh5d2hhZ2dtanJidHZrYW5tIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NDY1OTYwMywiZXhwIjoyMDYwMjM1NjAzfQ.VFY-werwsPl7QVJJBWqwuELQZFND5uWEY70MJ5D_WeY'
      },
      body: JSON.stringify(request.payload)
    })
    .then(response => {
      console.log('Background: Status de respuesta:', response.status);
      return response.text(); // Changed to text() to handle various response types
    })
    .then(data => {
      console.log('Background: Respuesta recibida:', data);
      try {
        const jsonData = JSON.parse(data);
        if (jsonData.error || (jsonData.code && jsonData.code >= 400)) {
          console.error('Background: Error en respuesta JSON:', jsonData);
          sendResponse({ 
            success: false, 
            error: jsonData.error || jsonData.message || 'Error de servidor' 
          });
        } else {
          console.log('Background: Respuesta exitosa:', jsonData);
          sendResponse({ success: true, data: jsonData }); // Send parsed JSON data
        }
      } catch (e) {
        // Handle non-JSON success responses (e.g., empty or simple string)
        if (data.trim() === '' || response.ok) { // Check response.ok for non-JSON success
            console.log('Background: Respuesta no JSON pero exitosa (o vacía)');
            sendResponse({ success: true, data: data || 'OK' });
        } else {
            console.log('Background: Respuesta no es JSON válido y no fue exitosa:', data);
            sendResponse({ success: false, error: 'Respuesta no válida del servidor' });
        }
      }
    })
    .catch(error => {
      console.error('Background: Error al enviar datos:', error);
      sendResponse({ success: false, error: error.message });
    });
    
    return true; // Indica que la respuesta se enviará de forma asíncrona
  }
  // Removed: Listener for scrapeProfile related actions from background, if any, assuming directExtractProfile is called via scripting.executeScript
});

// Mensaje para confirmar que el background script está activo
console.log('LinkedIn Profile Scraper: Background script cargado (versión simplificada)');

// Función principal para iniciar el proceso de búsqueda
function startSearchProcess(searchUrl) {
  console.log("Iniciando búsqueda en:", searchUrl);
  
  // Abrir una nueva pestaña con la búsqueda
  chrome.tabs.create({url: searchUrl, active: true}, function(tab) {
    searchTabId = tab.id;
    
    // Esperar a que la página cargue
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
      if (tabId === searchTabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        
        // Dar tiempo para que LinkedIn cargue completamente
        setTimeout(() => {
          extractProfileLinks(searchTabId);
        }, getRandomDelay(3000, 5000));
      }
    });
  });
}

// Función para extraer los enlaces a perfiles de la página de resultados
function extractProfileLinks(tabId) {
  if (shouldStop) {
    completeBusqueda("Búsqueda detenida por el usuario");
    return;
  }
  
  chrome.scripting.executeScript({
    target: {tabId: tabId},
    function: function() {
      // Esta función se ejecuta en el contexto de la página de búsqueda
      const profileLinks = [];
      
      // Intentar varios selectores para encontrar los enlaces de perfil
      const selectors = [
        // Selector para la nueva interfaz
        'a.app-aware-link[href*="/in/"]',
        // Selectores para la interfaz anterior
        '.search-result__info a[href*="/in/"]',
        '.entity-result__title a[href*="/in/"]',
        // Selector genérico como última opción
        'a[href*="linkedin.com/in/"]'
      ];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        if (elements && elements.length > 0) {
          elements.forEach(element => {
            const href = element.href;
            if (href && href.includes('/in/') && !profileLinks.includes(href)) {
              // Asegurarnos de que es una URL completa
              profileLinks.push(href);
            }
          });
        }
      }
      
      return {
        links: profileLinks,
        hasNextPage: document.querySelector('.artdeco-pagination__button--next:not(.artdeco-button--disabled)') !== null
      };
    }
  }, async (results) => {
    if (chrome.runtime.lastError) {
      console.error("Error al extraer enlaces:", chrome.runtime.lastError);
      completeBusqueda("Error al extraer enlaces de perfiles");
      return;
    }
    
    if (!results || !results[0] || !results[0].result) {
      completeBusqueda("No se pudo obtener resultados de la página");
      return;
    }
    
    const result = results[0].result;
    
    // Añadir enlaces encontrados a nuestra lista
    if (result.links && result.links.length > 0) {
      result.links.forEach(link => {
        if (!profilesFound.includes(link)) {
          profilesFound.push(link);
        }
      });
      
      console.log(`Encontrados ${profilesFound.length} perfiles en total`);
      
      // Notificar al popup los perfiles encontrados
      chrome.runtime.sendMessage({
        action: "profilesFound",
        profiles: profilesFound
      });
      
      // Si ya tenemos suficientes perfiles o no hay más páginas, empezar a procesarlos
      if (profilesFound.length >= maxProfiles || !result.hasNextPage) {
        await processNextProfile();
      } else {
        // Ir a la siguiente página de resultados
        await goToNextPage(tabId);
      }
    } else {
      completeBusqueda("No se encontraron perfiles en la búsqueda");
    }
  });
}

// Navegar a la siguiente página de resultados
async function goToNextPage(tabId) {
  if (shouldStop) {
    completeBusqueda("Búsqueda detenida por el usuario");
    return;
  }
  
  // Esperar un tiempo aleatorio para simular comportamiento humano
  await sleep(getRandomDelay(2000, 4000));
  
  chrome.scripting.executeScript({
    target: {tabId: tabId},
    function: function() {
      const nextButton = document.querySelector('.artdeco-pagination__button--next:not(.artdeco-button--disabled)');
      if (nextButton) {
        nextButton.click();
        return true;
      }
      return false;
    }
  }, async (results) => {
    if (chrome.runtime.lastError) {
      console.error("Error al navegar a la siguiente página:", chrome.runtime.lastError);
      // En lugar de fallar, procedemos a procesar los perfiles que ya tenemos
      await processNextProfile();
      return;
    }
    
    const clicked = results[0].result;
    if (clicked) {
      // Esperar a que la página cargue
      chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
        if (tabId === searchTabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          
          // Dar tiempo para que LinkedIn cargue completamente
          setTimeout(() => {
            extractProfileLinks(searchTabId);
          }, getRandomDelay(3000, 5000));
        }
      });
    } else {
      // Si no pudimos hacer clic, proceder con los perfiles que ya tenemos
      await processNextProfile();
    }
  });
}

// Procesar el siguiente perfil
async function processNextProfile() {
  if (shouldStop || currentProfileIndex >= maxProfiles || currentProfileIndex >= profilesFound.length) {
    completeBusqueda("Proceso de perfiles completado");
    return;
  }
  
  const profileUrl = profilesFound[currentProfileIndex];
  console.log(`Procesando perfil ${currentProfileIndex + 1}/${Math.min(maxProfiles, profilesFound.length)}: ${profileUrl}`);
  
  // Esperar para evitar detecciones anti-scraping
  await sleep(getRandomDelay(3000, 6000));
  
  // Navegar al perfil
  chrome.tabs.update(searchTabId, {url: profileUrl}, function(tab) {
    // Esperar a que la página cargue
    chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo, tab) {
      if (tabId === searchTabId && changeInfo.status === 'complete' && tab.url === profileUrl) {
        chrome.tabs.onUpdated.removeListener(listener);
        
        // Dar tiempo para que LinkedIn cargue completamente el perfil
        setTimeout(() => {
          extractProfileData(searchTabId);
        }, getRandomDelay(3000, 5000));
      }
    });
  });
}

// Extraer datos del perfil (KEPT for potential use by popup.js via scripting.executeScript for fallback)
// This function might be directly injected by popup.js, or called via a message if preferred.
// For now, assuming it's kept here if popup.js's `extractWithFunction` injects code that calls a function defined in background.js context (less common for executeScript `function` type).
// More likely, `directExtractProfile` is entirely self-contained within popup.js's `extractWithFunction`'s injected block.
// Let's assume directExtractProfile in background.js is the one used by background.js itself if it were to do an extraction.
// If popup.js's `extractWithFunction` directly injects its OWN version of directExtractProfile, then this one in background.js can be removed.
// Given the current structure where popup.js has its own extensive directExtractProfile, the one in background.js is likely redundant or for a different flow.
// For clarity and to ensure no breakage if there's a subtle call I missed: I'll keep directExtractProfile and its helpers here but note they might be dead code if popup.js handles all direct extraction.

function extractProfileData(tabId) {
  chrome.scripting.executeScript({
    target: {tabId: tabId},
    files: ['content.js'] // This implies content.js is still used for primary extraction
  }, function() {
    chrome.tabs.sendMessage(tabId, {action: "scrapeProfile"}, function(response) {
      if (chrome.runtime.lastError || !response || !response.success) {
        console.log("Fallback a método directo de extracción en background.js (si se llega aquí)");
        chrome.scripting.executeScript({
          target: {tabId: tabId},
          function: directExtractProfile // This `directExtractProfile` is the one below in background.js
        }, handleExtractedData);
      } else {
        handleProfileData(response); // This implies background.js handles data after content.js extraction
      }
    });
  });
}

function directExtractProfile() {
  try {
    function getName() {
      const selectors = [
        '.text-heading-xlarge',
        '.pv-top-card-section__name',
        '.profile-topcard-person-entity__name',
        'h1.text-heading-xlarge',
        'h1'
      ];
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          if (element && element.textContent.trim()) {
            return element.textContent.trim();
          }
        }
      }
      return 'Nombre no encontrado';
    }
    function getHeadline() {
      const selectors = [
        '.text-body-medium',
        '.pv-top-card-section__headline',
        '.profile-topcard-person-entity__headline',
        'h2.mt1.t-18'
      ];
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          if (element && element.textContent.trim()) {
            return element.textContent.trim();
          }
        }
      }
      return '';
    }
    function getLocation() {
      const selectors = [
        '.text-body-small.inline.t-black--light.break-words',
        '.pv-top-card-section__location',
        '.profile-topcard-person-entity__location',
        '.pb2.pv-text-details__left-panel',
        'span.text-body-small.inline'
      ];
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          if (element && element.textContent.trim()) {
            const text = element.textContent.trim();
            if (text.length < 100 && !text.includes("followers") && !text.includes("seguidores")) {
              return text;
            }
          }
        }
      }
      return '';
    }
    function getBasicInfo(title) {
      const sections = Array.from(document.querySelectorAll('section'));
      for (const section of sections) {
        const heading = section.querySelector('h2');
        if (heading && (heading.textContent.includes(title))) {
          return section.textContent.replace(heading.textContent, '').trim();
        }
      }
      return '';
    }
    const timestamp = new Date().toISOString();
    const profileData = {
      name: getName(),
      headline: getHeadline(),
      location: getLocation(),
      about: getBasicInfo('Acerca de') || getBasicInfo('About'),
      experience: getBasicInfo('Experiencia') || getBasicInfo('Experience'),
      education: getBasicInfo('Educación') || getBasicInfo('Education'),
      skills: getBasicInfo('Habilidades') || getBasicInfo('Skills'),
      profileUrl: window.location.href,
      extractionDate: timestamp,
      source: 'direct_extraction_background_version'
    };
    return {success: true, data: profileData};
  } catch (error) {
    console.error("Error en extracción directa (background.js):", error);
    return {success: false, message: error.toString()};
  }
}

function handleExtractedData(results) {
  if (chrome.runtime.lastError) {
    console.error("Error al ejecutar script (background.js):", chrome.runtime.lastError);
    // This would message popup, but popup's listener is mostly removed.
    // For a manual scrape, the popup initiates and should handle its own status.
    // So, this might just log or do nothing further if not part of automated flow.
    // chrome.runtime.sendMessage({ action: "profileProcessed", profileData: {success: false, message: chrome.runtime.lastError.message} });
    return;
  }
  const result = results[0].result;
  // chrome.runtime.sendMessage({ action: "profileProcessed", profileData: result });
  console.log("Data extracted by background's direct method:", result);
}

// This function was for the automated flow, processing data and moving to next profile.
// For manual scrape, popup.js handles its own data processing after extraction.
// Commenting out as it seems tied to the automated loop.
/*
async function handleProfileData(profileData) {
  chrome.runtime.sendMessage({
    action: "profileProcessed",
    profileData: profileData
  });
  currentProfileIndex++;
  if (shouldStop || currentProfileIndex >= maxProfiles || currentProfileIndex >= profilesFound.length) {
    completeBusqueda("Proceso de perfiles completado");
  } else {
    await processNextProfile();
  }
}
*/

// Finalizar el proceso de búsqueda
function completeBusqueda(message) {
  console.log("Completando búsqueda:", message);
  
  // Limpiar el estado
  isSearching = false;
  shouldStop = false;
  
  // Notificar al popup
  chrome.runtime.sendMessage({
    action: "searchComplete",
    message: message
  });
  
  // Eliminar el estado de búsqueda guardado
  chrome.storage.local.remove(['searchInProgress']);
}

// Función para manejar errores en el proceso
function handleSearchError(error) {
  console.error("Error en el proceso de búsqueda:", error);
  
  // Limpiar el estado
  isSearching = false;
  shouldStop = false;
  
  // Notificar al popup
  chrome.runtime.sendMessage({
    action: "searchError",
    error: error.toString()
  });
  
  // Eliminar el estado de búsqueda guardado
  chrome.storage.local.remove(['searchInProgress']);
}

// Utilidades (KEPT, as they might be used by remaining functions, e.g. directExtractProfile if it had delays)
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1) + min);
}

// Removed: ensureDelay (was for automated search pacing)
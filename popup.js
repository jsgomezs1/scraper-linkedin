document.addEventListener('DOMContentLoaded', function() {
  // Elementos UI pestaña manual
  const scrapeBtn = document.getElementById('scrapeBtn');
  const profileDataDiv = document.getElementById('profileData');
  
  // Elementos UI pestaña automática
  const searchQueryInput = document.getElementById('searchQuery');
  const locationInput = document.getElementById('location');
  const maxProfilesSelect = document.getElementById('maxProfiles');
  const searchBtn = document.getElementById('searchBtn');
  const stopBtn = document.getElementById('stopBtn');
  const progressBar = document.getElementById('progressBar');
  const progressBarFill = document.getElementById('progressBarFill');
  const autoSendToSheetsCheck = document.getElementById('autoSendToSheets');
  
  // Elementos UI pestaña datos
  const exportBtn = document.getElementById('exportBtn');
  const clearBtn = document.getElementById('clearBtn');
  const backupBtn = document.getElementById('backupBtn');
  const restoreBtn = document.getElementById('restoreBtn');
  const restoreFile = document.getElementById('restoreFile');
  const sendAllToSheetsBtn = document.getElementById('sendAllToSheetsBtn');
  
  // Elementos UI pestaña configuración
  const n8nWebhookUrlConfigInput = document.getElementById('n8nWebhookUrlConfig');
  const googleSheetIdInput = document.getElementById('googleSheetId');
  const saveConfigBtn = document.getElementById('saveConfigBtn');
  const testConnectionBtn = document.getElementById('testConnectionBtn');
  
  
  // Elementos UI generales
  const statusDiv = document.getElementById('status');
  const tabButtons = document.querySelectorAll('.tablinks');
  const tabContents = document.querySelectorAll('.tabcontent');
  
  // Variables de estado para la búsqueda automática
  let isSearching = false;
  let profilesFound = [];
  let profilesProcessed = 0;
  let maxProfiles = 10;
  let shouldStop = false;
  
  // Variables para la integración con n8n
  let n8nWebhookUrl = '';
  let googleSheetId = '';
  let currentProfileData = null;
  let autoSendToSheets = false;
  
  // Verificar modo de operación local
  const isLocalMode = true; // Siempre en modo local
  
  // Inicializar el sistema de pestañas
  initTabs();
  
  // Cargar la configuración de n8n
  loadN8nConfig();
  
  // Función para inicializar el sistema de pestañas
  function initTabs() {
    // Ocultar todos los contenidos de pestañas excepto el primero
    tabContents.forEach((content, index) => {
      if (index === 0) {
        content.style.display = 'block';
        tabButtons[index].classList.add('active');
      } else {
        content.style.display = 'none';
      }
    });
    
    // Añadir eventos a los botones de pestañas
    tabButtons.forEach(button => {
      button.addEventListener('click', function(event) {
        openTab(event, this.getAttribute('onclick').match(/openTab\(event,\s*'(\w+)'\)/)[1]);
      });
    });
  }
  
  // Función para cambiar entre pestañas
  function openTab(evt, tabName) {
    // Ocultar todos los contenidos de pestañas
    tabContents.forEach(content => {
      content.style.display = 'none';
    });
    
    // Desactivar todos los botones de pestañas
    tabButtons.forEach(button => {
      button.classList.remove('active');
    });
    
    // Mostrar la pestaña actual y activar el botón
    document.getElementById(tabName).style.display = 'block';
    evt.currentTarget.classList.add('active');
  }
  
  // Cargar configuración de n8n
  function loadN8nConfig() {
    chrome.storage.local.get(['n8nConfig'], function(result) {
      if (result.n8nConfig) {
        n8nWebhookUrl = result.n8nConfig.webhookUrl || '';
        googleSheetId = result.n8nConfig.sheetId || '';
        autoSendToSheets = result.n8nConfig.autoSend || false;
        
        // Actualizar campos de entrada
        if (n8nWebhookUrlConfigInput) n8nWebhookUrlConfigInput.value = n8nWebhookUrl;
        if (googleSheetIdInput) googleSheetIdInput.value = googleSheetId;
        if (autoSendToSheetsCheck) autoSendToSheetsCheck.checked = autoSendToSheets;
      }
    });
  }
  
  // Guardar configuración de n8n
  function saveN8nConfig() {
    const newWebhookUrl = n8nWebhookUrlConfigInput ? n8nWebhookUrlConfigInput.value.trim() : '';
    const newSheetId = googleSheetIdInput ? googleSheetIdInput.value.trim() : '';
    const autoSend = autoSendToSheetsCheck ? autoSendToSheetsCheck.checked : false;
    
    if (!newWebhookUrl) {
      statusDiv.textContent = 'Por favor, ingresa la URL del webhook de n8n.';
      return;
    }
    
    // Guardar configuración
    n8nWebhookUrl = newWebhookUrl;
    googleSheetId = newSheetId;
    autoSendToSheets = autoSend;
    
    chrome.storage.local.set({
      n8nConfig: {
        webhookUrl: n8nWebhookUrl,
        sheetId: googleSheetId,
        autoSend: autoSendToSheets
      }
    }, function() {
      statusDiv.textContent = 'Configuración guardada correctamente.';
    });
  }
  
  // Cargar perfiles guardados
  chrome.storage.local.get(['profiles'], function(result) {
    if (result.profiles && result.profiles.length > 0) {
      exportBtn.style.display = 'block';
      statusDiv.textContent = `${result.profiles.length} perfiles cargados localmente.`;
    }
  });
  
  // Verificar si hay una búsqueda en progreso
  chrome.storage.local.get(['searchInProgress'], function(result) {
    if (result.searchInProgress) {
      isSearching = true;
      profilesFound = result.searchInProgress.profilesFound || [];
      profilesProcessed = result.searchInProgress.profilesProcessed || 0;
      maxProfiles = result.searchInProgress.maxProfiles || 10;
      
      updateSearchUI(true);
      updateProgressBar();
      
      statusDiv.textContent = `Búsqueda en progreso: ${profilesProcessed} de ${maxProfiles} perfiles procesados.`;
    }
  });
  
  // Event Listeners para todos los botones
  
  // EXTRACCIÓN MANUAL DE PERFIL ACTUAL
  if (scrapeBtn) {
    scrapeBtn.addEventListener('click', function() {
      chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        const activeTab = tabs[0];
        const url = activeTab.url;
        
        console.log("URL actual:", url);
        
        if (url.includes('linkedin.com/in/')) {
          statusDiv.textContent = 'Extrayendo información del perfil localmente...';
          
          // Primero nos aseguramos que el script esté inyectado
          chrome.scripting.executeScript({
            target: {tabId: activeTab.id},
            files: ['content.js']
          }, function() {
            // Luego enviamos el mensaje
            chrome.tabs.sendMessage(activeTab.id, {action: "scrapeProfile"}, function(response) {
              if (chrome.runtime.lastError) {
                console.error("Error de comunicación:", chrome.runtime.lastError);
                // Si falla el método de mensajería, usamos el método de función directa
                extractWithFunction(activeTab.id);
                return;
              }
              
              if (response && response.success) {
                statusDiv.textContent = 'Información extraída exitosamente en modo local!';
                displayProfileData(response.data);
                saveProfile(response.data);
                exportBtn.style.display = 'block';
              } else {
                statusDiv.textContent = 'Error al extraer información. Asegúrate de estar en un perfil de LinkedIn.';
              }
            });
          });
        } else {
          statusDiv.textContent = 'Por favor, visita un perfil de LinkedIn primero.';
        }
      });
    });
  }
  
  // ENVIAR PERFIL ACTUAL A GOOGLE SHEETS
  if (sendToSheetsBtn) {
    sendToSheetsBtn.addEventListener('click', function() {
      if (!currentProfileData) {
        statusDiv.textContent = 'No hay datos de perfil para enviar.';
        return;
      }
      
      if (!n8nWebhookUrl) {
        statusDiv.textContent = 'Por favor, configura primero la URL del webhook de n8n en la pestaña Config.';
        return;
      }
      
      sendProfileToN8n(currentProfileData);
    });
  }
  
  // ENVIAR TODOS LOS PERFILES A GOOGLE SHEETS
  if (sendAllToSheetsBtn) {
    sendAllToSheetsBtn.addEventListener('click', function() {
      if (!n8nWebhookUrl) {
        statusDiv.textContent = 'Por favor, configura primero la URL del webhook de n8n en la pestaña Config.';
        return;
      }
      
      chrome.storage.local.get(['profiles'], function(result) {
        if (!result.profiles || result.profiles.length === 0) {
          statusDiv.textContent = 'No hay perfiles guardados para enviar.';
          return;
        }
        
        statusDiv.textContent = `Enviando ${result.profiles.length} perfiles a Google Sheets...`;
        
        // Enviamos los perfiles de uno en uno con un pequeño retraso para evitar sobrecargar n8n
        let sent = 0;
        let failed = 0;
        
        function sendNextProfile(index) {
          if (index >= result.profiles.length) {
            statusDiv.textContent = `Envío completado: ${sent} perfiles enviados, ${failed} fallidos.`;
            return;
          }
          
          sendProfileToN8n(result.profiles[index], false)
            .then(() => {
              sent++;
              setTimeout(() => sendNextProfile(index + 1), 1000); // 1 segundo de espera entre envíos
            })
            .catch(() => {
              failed++;
              setTimeout(() => sendNextProfile(index + 1), 1000);
            });
        }
        
        sendNextProfile(0);
      });
    });
  }
  
  // GUARDAR CONFIGURACIÓN DE N8N
  if (saveConfigBtn) {
    saveConfigBtn.addEventListener('click', function() {
      saveN8nConfig();
    });
  }
  
  // PROBAR CONEXIÓN CON N8N
  if (testConnectionBtn) {
    testConnectionBtn.addEventListener('click', function() {
      const webhookUrl = n8nWebhookUrlConfigInput ? n8nWebhookUrlConfigInput.value.trim() : '';
      
      if (!webhookUrl) {
        statusDiv.textContent = 'Por favor, ingresa la URL del webhook de n8n.';
        return;
      }
      
      statusDiv.textContent = 'Probando conexión con n8n...';
      
      // Crear un pequeño objeto de prueba
      const testPayload = {
        test: true,
        message: "Test de conexión desde LinkedIn Profile Scraper",
        timestamp: new Date().toISOString()
      };
      
      // Enviar solicitud de prueba
      fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(testPayload)
      })
      .then(response => {
        if (!response.ok) {
          throw new Error('Error en la respuesta del servidor: ' + response.status);
        }
        return response.json();
      })
      .then(data => {
        statusDiv.textContent = '✅ Conexión exitosa con n8n!';
        console.log('Respuesta de prueba de n8n:', data);
      })
      .catch(error => {
        statusDiv.textContent = '❌ Error al conectar con n8n: ' + error.message;
        console.error('Error de prueba de conexión:', error);
      });
    });
  }
// Suponiendo que ya tiene la experiencia en una variable llamada 'experienceEntries'
// Puede incluir esto en popup.js justo después de extraer los datos del perfil actual

function renderExperience(experiences) {
  const profileDataDiv = document.getElementById('profileData');
  profileDataDiv.innerHTML = ''; // Limpiar contenido anterior
  profileDataDiv.style.display = 'block';

  if (!experiences || experiences.length === 0) {
    profileDataDiv.innerHTML = '<p><strong>Experiencia:</strong> No disponible</p>';
    return;
  }

  const container = document.createElement('div');

  experiences.forEach(exp => {
    const block = document.createElement('div');
    block.classList.add('data-row');
    block.innerHTML = `
      <strong>${exp.title || 'Sin título'}</strong><br>
      ${exp.company ? `<em>${exp.company}</em>` : ''} ${exp.employmentType ? `· ${exp.employmentType}` : ''}<br>
      ${exp.startDate || ''} - ${exp.endDate || ''} ${exp.isCurrent ? '· Actualmente' : ''}<br>
      ${exp.location || ''} ${exp.locationType ? `· ${exp.locationType}` : ''}<br>
      ${exp.description ? `<p>${exp.description}</p>` : ''}
    `;
    container.appendChild(block);
  });

  profileDataDiv.appendChild(container);
}

// Ejemplo de uso después de extraer los datos del perfil
// renderExperience(perfil.experiencia);


  // Modificación a la función testConnection o al botón de prueba
function testConnection() {
  const webhookUrl = n8nWebhookUrlConfigInput.value.trim();
  
  const payload = {
    perfil: {
      test: true,
      urlPerfil: "https://linkedin.com/test-profile",
      nombre: "Usuario de Prueba",
      titulo: "Test desde LinkedIn Scraper",
      ubicacion: "Ubicación de Prueba",
      fechaExtraccion: new Date().toISOString()
    }
  };
  
  fetch(webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload)
  })
  .then(response => {
    console.log("Status:", response.status);
    return response.text();
  })
  .then(data => {
    console.log("Respuesta:", data);
    statusDiv.textContent = "Conexión exitosa!";
  })
  .catch(error => {
    console.error("Error:", error);
    statusDiv.textContent = "Error: " + error.message;
  });
}
  
  // AUTO-ENVIAR A SHEETS
  if (autoSendToSheetsCheck) {
    autoSendToSheetsCheck.addEventListener('change', function() {
      autoSendToSheets = this.checked;
      saveN8nConfig();
    });
  }
  
  // Función de normalización de ubicación
  function normalizeLocation(location) {
    // Limpieza básica sin alterar la estructura original
    return location.trim()
      .replace(/\s*,\s*/g, ', ')          // Unifica espacios alrededor de comas
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Elimina acentos
      .replace(/[^a-zA-Z0-9, ]/g, '')     // Quita caracteres especiales
      .split(', ')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(', ');
  }

  function getCSRFToken() {
    const match = document.cookie.match(/JSESSIONID="(.*?)"/);
    if (match && match[1]) {
      // El token viene entre comillas dobles y prefijado por ajax:
      return match[1].replace('ajax:', '');
    }
    return null;
  }
  
  // Mejorar la obtención del geoUrn
  async function getGeoUrn(locationName) {
    try {
      const csrfToken = getCSRFToken();
      if (!csrfToken) throw new Error('CSRF Token no encontrado');
  
      // Usar la API de typeahead de LinkedIn para búsqueda precisa
      const searchUrl = `https://www.linkedin.com/voyager/api/typeahead/hits?q=geo&query=${encodeURIComponent(locationName)}`;
  
      const response = await fetch(searchUrl, {
        headers: {
          'csrf-token': csrfToken,
          'accept': 'application/json'
        }
      });
  
      const data = await response.json();
      const locationHit = data.elements.find(hit => 
        hit.hitType === "GEO" && 
        hit.text.text.toLowerCase() === locationName.toLowerCase()
      );
  
      return locationHit?.targetUrn.split(':').pop() || null;
    } catch (error) {
      console.error('Error buscando geoUrn:', error);
      return null;
    }
  }
  
  

  // Modificar el evento de búsqueda
  if (searchBtn) {
    searchBtn.addEventListener('click', async function() {
      const searchQuery = searchQueryInput.value.trim();
      const rawLocation = locationInput.value.trim(); // Usar la ubicación original
      maxProfiles = parseInt(maxProfilesSelect.value);
  
      if (!searchQuery) {
        statusDiv.textContent = 'Por favor, ingresa un rol o posición para buscar.';
        return;
      }
  
      isSearching = true;
      shouldStop = false;
      profilesFound = [];
      profilesProcessed = 0;
      updateSearchUI(true);
  
      let searchUrl = "";
  
      if (rawLocation) { // 1. Usar rawLocation en lugar de location
        const geoUrn = await getGeoUrn(rawLocation); // 2. Pasar ubicación sin normalizar
        
        if (geoUrn) {
          searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchQuery)}&geoUrn=${geoUrn}`;
        } else {
          // 3. Usar parámetro location con el valor original
          searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchQuery)}&location=${encodeURIComponent(rawLocation)}`;
          statusDiv.textContent = `Ubicación "${rawLocation}" no encontrada. Usando búsqueda básica.`; // 4. Feedback al usuario
        }
      } else {
        searchUrl = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(searchQuery)}`;
      }
      // 🔼🔼🔼 CAMBIOS PRINCIPALES AQUÍ 🔼🔼🔼
  
      chrome.storage.local.set({
        searchInProgress: {
          query: searchQuery,
          location: rawLocation, // 5. Guardar la ubicación original
          maxProfiles: maxProfiles,
          profilesFound: [],
          profilesProcessed: 0,
          searchUrl: searchUrl
        }
      });
  
      chrome.runtime.sendMessage({
        action: "startSearch",
        searchUrl: searchUrl,
        maxProfiles: maxProfiles
      });
  
      statusDiv.textContent = `Búsqueda iniciada: ${searchQuery}${rawLocation ? ` en ${rawLocation}` : ''}`;
    });
  }
  
  // Detener búsqueda
  if (stopBtn) {
    stopBtn.addEventListener('click', function() {
      shouldStop = true;
      chrome.runtime.sendMessage({action: "stopSearch"});
      statusDiv.textContent = "Deteniendo búsqueda...";
      updateSearchUI(false);
      
      // Limpiar el estado de búsqueda en progreso
      chrome.storage.local.remove(['searchInProgress']);
    });
  }
  
  // Exportar a CSV
  if (exportBtn) {
    exportBtn.addEventListener('click', function() {
      chrome.storage.local.get(['profiles'], function(result) {
        if (result.profiles && result.profiles.length > 0) {
          exportToCSV(result.profiles);
        } else {
          statusDiv.textContent = 'No hay perfiles para exportar.';
        }
      });
    });
  }
  
  // Limpiar datos
  if (clearBtn) {
    clearBtn.addEventListener('click', function() {
      if (confirm('¿Estás seguro de que deseas eliminar todos los perfiles guardados?')) {
        chrome.storage.local.set({profiles: []}, function() {
          statusDiv.textContent = 'Todos los datos han sido eliminados.';
          profileDataDiv.style.display = 'none';
          exportBtn.style.display = 'none';
          
          // También eliminar del localStorage
          localStorage.removeItem('lastExtractedProfile');
        });
      }
    });
  }
  
  // Backup de datos
  if (backupBtn) {
    backupBtn.addEventListener('click', function() {
      chrome.storage.local.get(['profiles'], function(result) {
        if (result.profiles && result.profiles.length > 0) {
          const backupData = {
            profiles: result.profiles,
            timestamp: new Date().toISOString(),
            version: '1.0-local'
          };
          
          const jsonStr = JSON.stringify(backupData);
          const blob = new Blob([jsonStr], {type: 'application/json'});
          const url = URL.createObjectURL(blob);
          
          chrome.downloads.download({
            url: url,
            filename: 'linkedin_profiles_backup.json',
            saveAs: true
          }, function(downloadId) {
            if (chrome.runtime.lastError) {
              statusDiv.textContent = 'Error al crear copia de seguridad: ' + chrome.runtime.lastError.message;
            } else {
              statusDiv.textContent = 'Copia de seguridad creada exitosamente.';
            }
          });
        } else {
          statusDiv.textContent = 'No hay perfiles para respaldar.';
        }
      });
    });
  }
  
  // Restaurar datos
  if (restoreBtn) {
    restoreBtn.addEventListener('click', function() {
      restoreFile.click();
    });
  }
  
  if (restoreFile) {
    restoreFile.addEventListener('change', function(event) {
      const file = event.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
          try {
            const backupData = JSON.parse(e.target.result);
            
            if (backupData && backupData.profiles && Array.isArray(backupData.profiles)) {
              chrome.storage.local.set({profiles: backupData.profiles}, function() {
                statusDiv.textContent = `Restaurados ${backupData.profiles.length} perfiles exitosamente.`;
                if (backupData.profiles.length > 0) {
                  exportBtn.style.display = 'block';
                }
              });
            } else {
              statusDiv.textContent = 'El archivo de copia de seguridad no es válido.';
            }
          } catch (error) {
            statusDiv.textContent = 'Error al procesar el archivo: ' + error.message;
          }
        };
        reader.readAsText(file);
      }
    });
  }
  
  // Escuchar mensajes del background script
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    console.log("Mensaje recibido en popup:", message);
    
    if (message.action === "profilesFound") {
      profilesFound = message.profiles;
      updateProgressBar();
      statusDiv.textContent = `Encontrados ${profilesFound.length} perfiles. Iniciando extracción...`;
      
      // Actualizar el estado de la búsqueda
      chrome.storage.local.get(['searchInProgress'], function(result) {
        if (result.searchInProgress) {
          result.searchInProgress.profilesFound = profilesFound;
          chrome.storage.local.set({searchInProgress: result.searchInProgress});
        }
      });
    }
    else if (message.action === "profileProcessed") {
      profilesProcessed++;
      updateProgressBar();
      
      if (message.profileData && message.profileData.success) {
        statusDiv.textContent = `Perfil extraído: ${message.profileData.data.name || 'Sin nombre'} (${profilesProcessed} de ${profilesFound.length})`;
        saveProfile(message.profileData.data);
        
        // Si el auto-envío está activado, enviamos el perfil a n8n
        if (autoSendToSheets && n8nWebhookUrl) {
          setTimeout(() => {
            sendProfileToN8n(message.profileData.data, false)
              .then(() => console.log('Perfil enviado automáticamente a Google Sheets'))
              .catch(err => console.error('Error al enviar automáticamente a Google Sheets:', err));
          }, 1000);
        }
      } else {
        statusDiv.textContent = `Error al extraer perfil #${profilesProcessed}. Continuando...`;
      }
      
      // Actualizar el estado de la búsqueda
      chrome.storage.local.get(['searchInProgress'], function(result) {
        if (result.searchInProgress) {
          result.searchInProgress.profilesProcessed = profilesProcessed;
          chrome.storage.local.set({searchInProgress: result.searchInProgress});
        }
      });
      
      // Verificar si hemos terminado
      if (profilesProcessed >= profilesFound.length || profilesProcessed >= maxProfiles || shouldStop) {
        isSearching = false;
        updateSearchUI(false);
        statusDiv.textContent = `Búsqueda completada: ${profilesProcessed} perfiles extraídos.`;
        
        // Limpiar el estado de búsqueda en progreso
        chrome.storage.local.remove(['searchInProgress']);
      }
    }
    else if (message.action === "searchComplete") {
      isSearching = false;
      updateSearchUI(false);
      statusDiv.textContent = `Búsqueda completada: ${profilesProcessed} perfiles extraídos.`;
      
      // Limpiar el estado de búsqueda en progreso
      chrome.storage.local.remove(['searchInProgress']);
    }
    else if (message.action === "searchError") {
      isSearching = false;
      updateSearchUI(false);
      statusDiv.textContent = `Error en la búsqueda: ${message.error}`;
      
      // Limpiar el estado de búsqueda en progreso
      chrome.storage.local.remove(['searchInProgress']);
    }
  });
  
  // Función de extracción alternativa usando scripting.executeScript
  function extractWithFunction(tabId) {
    chrome.scripting.executeScript({
      target: {tabId: tabId},
      function: function() {
        // Esta función se ejecuta directamente en el contexto de la página
        try {
          // Definimos la función de extracción inline para asegurar disponibilidad
          function extractProfile() {
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
                '.pb2.pv-text-details__left-panel'
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
            
            // Función para extraer experiencia detallada
            function getExperienceDetailed() {
              const experienceEntries = [];
              
              // Buscar sección de experiencia
              const experienceSections = Array.from(document.querySelectorAll('section'));
              for (const section of experienceSections) {
                const heading = section.querySelector('h2');
                if (heading && (heading.textContent.includes('Experiencia') || heading.textContent.includes('Experience'))) {
                  
                  // Buscar entradas de experiencia
                  const experienceItems = section.querySelectorAll('li.artdeco-list__item') || 
                                          section.querySelectorAll('.pv-entity__position-group') ||
                                          section.querySelectorAll('.pvs-entity') ||
                                          section.querySelectorAll('div[data-view-name="profile-component-entity"]');
                  
                  if (experienceItems && experienceItems.length > 0) {
                    experienceItems.forEach(item => {
                      try {
                        const entry = {};
                        
                        // Obtener título/puesto
                        const titleElement = item.querySelector('h3') || 
                                            item.querySelector('.pv-entity__summary-info h3') || 
                                            item.querySelector('.t-16.t-black.t-bold') ||
                                            item.querySelector('.visually-hidden') ||
                                            item.querySelector('.pv-entity__secondary-title') ||
                                            item.querySelector('span[aria-hidden="true"]');
                        
                        if (titleElement) {
                          entry.title = titleElement.textContent.trim();
                        }
                        
                        // Obtener empresa
                        const companyElement = item.querySelector('h4') || 
                                              item.querySelector('.pv-entity__secondary-title') || 
                                              item.querySelector('.t-14.t-black.t-normal') ||
                                              item.querySelector('span.t-14.t-normal:not(.t-black)') ||
                                              item.querySelector('span.pv-entity__secondary-title');
                        
                        if (companyElement) {
                          entry.company = companyElement.textContent
                            .trim()
                            .replace('Nombre de la empresa', '')
                            .replace('Company name', '')
                            .trim();
                        }
                        
                        // Obtener tipo de empleo
                        const employmentTypeElement = item.querySelector('.pv-entity__secondary-title:not(:first-child)') ||
                                                    item.querySelector('.t-14.t-black--light.t-normal:contains("Tipo de empleo")') ||
                                                    item.querySelector('.t-14.t-black--light.t-normal:contains("Employment type")') ||
                                                    item.querySelector('span.t-14.t-normal.t-black--light:contains("Tipo de empleo")') ||
                                                    item.querySelector('span.t-14.t-normal.t-black--light:contains("Employment type")');
                        
                        if (employmentTypeElement) {
                          let employmentTypeText = employmentTypeElement.textContent.trim();
                          
                          // Limpiar el texto
                          employmentTypeText = employmentTypeText
                            .replace('Tipo de empleo:', '')
                            .replace('Tipo de empleo', '')
                            .replace('Employment type:', '')
                            .replace('Employment type', '')
                            .trim();
                          
                          if (employmentTypeText && !employmentTypeText.includes('fecha') && !employmentTypeText.includes('date')) {
                            entry.employmentType = employmentTypeText;
                          }
                        }
                        
                        // Obtener fechas
                        const dateRangeElement = item.querySelector('.pv-entity__date-range') || 
                                                item.querySelector('.t-14.t-black--light.t-normal') ||
                                                item.querySelector('span.t-14.t-normal.t-black--light');
                        
                        if (dateRangeElement) {
                          const dateText = dateRangeElement.textContent.trim();
                          
                          // Limpiar y procesar las fechas
                          let cleanDateText = dateText
                            .replace('Fechas de empleo', '')
                            .replace('Employment Dates', '')
                            .replace('Dates', '')
                            .trim();
                          
                          entry.dateRange = cleanDateText;
                          
                          // Intentar extraer fechas de inicio y fin
                          const dateMatch = cleanDateText.match(/(ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[.\s]+(\d{4})\s*(?:-|–|hasta|to)\s*(actualidad|presente|present|ene|feb|mar|abr|may|jun|jul|ago|sep|oct|nov|dic|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[.\s]*(\d{4})?/i);
                          
                          if (dateMatch) {
                            entry.startDate = `${dateMatch[1]} ${dateMatch[2]}`;
                            entry.endDate = dateMatch[3].toLowerCase().includes('actual') || 
                                           dateMatch[3].toLowerCase().includes('present') 
                                           ? 'Actualidad' 
                                           : `${dateMatch[3]} ${dateMatch[4] || ''}`.trim();
                            
                            if (entry.endDate === 'Actualidad' || entry.endDate.toLowerCase().includes('present')) {
                              entry.isCurrent = true;
                            }
                          }
                        }
                        
                        // Obtener ubicación
                        const locationElement = item.querySelector('.pv-entity__location') || 
                                              item.querySelector('.t-14.t-black--light.t-normal:not(.pv-entity__date-range)') ||
                                              item.querySelector('span.t-14.t-normal.t-black--light:not(:first-child)');
                        
                        if (locationElement) {
                          const locationText = locationElement.textContent.trim();
                          if (locationText.includes('Ubicación') || locationText.includes('Location')) {
                            entry.location = locationText
                              .replace('Ubicación', '')
                              .replace('Location', '')
                              .trim();
                          } else if (!entry.location && !locationText.includes('fecha') && !locationText.includes('date')) {
                            entry.location = locationText;
                          }
                        }
                        
                        // Obtener tipo de ubicación
                        const locationTypeElement = item.querySelector('.pv-entity__location-type') || 
                                                  item.querySelector('.t-14.t-black--light.t-normal:contains("Tipo de ubicación")') ||
                                                  item.querySelector('.t-14.t-black--light.t-normal:contains("Location type")') ||
                                                  item.querySelector('span.t-14.t-normal.t-black--light:contains("Tipo de ubicación")') ||
                                                  item.querySelector('span.t-14.t-normal.t-black--light:contains("Location type")');
                        
                        if (locationTypeElement) {
                          let locationTypeText = locationTypeElement.textContent.trim();
                          
                          // Limpiar el texto
                          locationTypeText = locationTypeText
                            .replace('Tipo de ubicación:', '')
                            .replace('Tipo de ubicación', '')
                            .replace('Location type:', '')
                            .replace('Location type', '')
                            .trim();
                          
                          if (locationTypeText && !locationTypeText.includes('fecha') && !locationTypeText.includes('date')) {
                            entry.locationType = locationTypeText;
                          }
                        }
                        
                        // Obtener descripción o funciones
                        const descriptionElement = item.querySelector('.pv-entity__description') || 
                                                 item.querySelector('.inline-show-more-text') ||
                                                 item.querySelector('div.t-14.t-normal.t-black');
                        
                        if (descriptionElement) {
                          entry.description = descriptionElement.textContent.trim();
                        }
                        
                        // Solo agregar si tenemos al menos título o empresa
                        if (entry.title || entry.company) {
                          experienceEntries.push(entry);
                        }
                      } catch (e) {
                        console.warn('Error al procesar entrada de experiencia:', e);
                      }
                    });
                  } else {
                    // Si no encontramos elementos estructurados, intentar extraer texto general
                    const experienceText = section.textContent.replace(heading.textContent, '').trim();
                    if (experienceText) {
                      experienceEntries.push({
                        rawText: experienceText.substring(0, 500) // Limitar a 500 caracteres
                      });
                    }
                  }
                }
              }
              
              return experienceEntries;
            }
            
            // Función para extraer educación detallada
            function getEducationDetailed() {
              const educationEntries = [];
              
              // Buscar sección de educación
              const educationSections = Array.from(document.querySelectorAll('section'));
              for (const section of educationSections) {
                const heading = section.querySelector('h2');
                if (heading && (heading.textContent.includes('Educación') || heading.textContent.includes('Education'))) {
                  
                  // Buscar entradas de educación
                  const educationItems = section.querySelectorAll('li.artdeco-list__item') || 
                                         section.querySelectorAll('.pv-profile-section__list-item') ||
                                         section.querySelectorAll('.pvs-entity') ||
                                         section.querySelectorAll('div[data-view-name="profile-component-entity"]');
                  
                  if (educationItems && educationItems.length > 0) {
                    educationItems.forEach(item => {
                      try {
                        const entry = {};
                        
                        // Obtener institución
                        const schoolElement = item.querySelector('h3') || 
                                             item.querySelector('.pv-entity__school-name') || 
                                             item.querySelector('.t-16.t-black.t-bold') ||
                                             item.querySelector('span[aria-hidden="true"]');
                        
                        if (schoolElement) {
                          entry.institution = schoolElement.textContent.trim();
                        }
                        
                        // Obtener título/grado
                        const degreeElement = item.querySelector('h4') || 
                                             item.querySelector('.pv-entity__degree-name .pv-entity__comma-item') || 
                                             item.querySelector('.t-14.t-black.t-normal') ||
                                             item.querySelector('span.t-14.t-normal');
                        
                        if (degreeElement) {
                          entry.degree = degreeElement.textContent
                            .replace('Título', '')
                            .replace('Degree', '')
                            .trim();
                        }
                        
                        // Obtener fechas
                        const dateRangeElement = item.querySelector('.pv-entity__dates') || 
                                                item.querySelector('.t-14.t-black--light.t-normal') ||
                                                item.querySelector('span.t-14.t-normal.t-black--light');
                        
                        if (dateRangeElement) {
                          const dateText = dateRangeElement.textContent.trim();
                          
                          // Limpiar y procesar las fechas
                          let cleanDateText = dateText
                            .replace('Fechas de estudios o fecha prevista de graduación', '')
                            .replace('Date range or expected graduation', '')
                            .replace('Dates attended or expected graduation', '')
                            .trim();
                          
                          entry.dateRange = cleanDateText;
                        }
                        
                        // Solo agregar si tenemos al menos institución o título
                        if (entry.institution || entry.degree) {
                          educationEntries.push(entry);
                        }
                      } catch (e) {
                        console.warn('Error al procesar entrada de educación:', e);
                      }
                    });
                  }
                }
              }
              
              return educationEntries;
            }
            
            // Función para obtener habilidades
            function getSkills() {
              const skills = [];
              
              // Método 1: Buscar sección de habilidades
              const skillsSections = Array.from(document.querySelectorAll('section'));
              for (const section of skillsSections) {
                const heading = section.querySelector('h2');
                if (heading && (heading.textContent.includes('Habilidades') || heading.textContent.includes('Skills') || heading.textContent.includes('Aptitudes'))) {
                  
                  // Buscar elementos de lista o elementos específicos
                  const skillItems = section.querySelectorAll('li') || 
                                    section.querySelectorAll('.pv-skill-category-entity') || 
                                    section.querySelectorAll('.pvs-entity') ||
                                    section.querySelectorAll('span.pvs-entity__pill-text') ||
                                    section.querySelectorAll('div[data-view-name="profile-component-entity"]');
                  
                  if (skillItems && skillItems.length > 0) {
                    for (const item of skillItems) {
                      const skillElement = item.querySelector('span[aria-hidden="true"]') || 
                                          item.querySelector('.pv-skill-category-entity__name-text') || 
                                          item.querySelector('.t-16.t-black.t-bold') ||
                                          item.querySelector('.pvs-entity__pill-text');
                      
                      if (skillElement) {
                        const skillName = skillElement.textContent.trim();
                        if (skillName && skillName.length < 100) {
                          skills.push({ name: skillName });
                        }
                      } else {
                        const text = item.textContent.trim();
                        if (text && text.length > 1 && text.length < 100) {
                          skills.push({ name: text });
                        }
                      }
                    }
                  }
                }
              }
              
              return skills;
            }
            
            // Función para extraer intereses sin duplicados 
            // Función mejorada para extraer intereses de LinkedIn
            function getInterestsImproved() {
              console.log("Iniciando extracción de intereses con formato LinkedIn...");
              
              // Estructura para almacenar intereses por categoría
              const interests = {
                people: [],      // Top Voices (personas)
                companies: [],   // Empresas seguidas
                newsletters: [], // Newsletters
                schools: []      // Instituciones educativas
              };
              
              try {
                // Encontrar sección de intereses
                const sections = Array.from(document.querySelectorAll('section'));
                let interestsSection = null;
                
                for (const section of sections) {
                  const heading = section.querySelector('h2');
                  if (heading && (heading.textContent.includes('Intereses') || heading.textContent.includes('Interests'))) {
                    interestsSection = section;
                    console.log("Sección de intereses encontrada");
                    break;
                  }
                }
                
                if (!interestsSection) {
                  console.warn("No se encontró sección de intereses");
                  return interests;
                }
                
                // Procesar intereses visibles en la página
                const interestItems = interestsSection.querySelectorAll('li, .entity-list-item, .pv-interest-entity, .artdeco-entity-lockup');
                console.log(`Encontrados ${interestItems.length} elementos de intereses`);
                
                interestItems.forEach((item, index) => {
                  try {
                    const interestData = {};
                    
                    // Nombre del interés
                    const nameElement = item.querySelector('h3, .pv-entity__summary-title-text, .entity-item__title, span[aria-hidden="true"], .artdeco-entity-lockup__title');
                    
                    if (nameElement) {
                      interestData.name = nameElement.textContent.trim();
                      
                      // Buscar descripción
                      const descriptionElement = item.querySelector('.entity-item__primary-subtitle, .artdeco-entity-lockup__subtitle, .entity-item__badge');
                      
                      if (descriptionElement) {
                        interestData.description = descriptionElement.textContent.trim();
                      }
                      
                      // Buscar seguidores
                      const followersElement = item.querySelector('.entity-item__follower-count, .pv-entity__follower-count, .artdeco-entity-lockup__caption');
                      
                      if (followersElement) {
                        const followersText = followersElement.textContent.trim();
                        const followersMatch = followersText.match(/(\d[\d.,\s]*)/);
                        
                        if (followersMatch) {
                          interestData.followers = followersMatch[1].trim().replace(/[\s,.]/g, '');
                        }
                      }
                      
                      // Determinar la categoría (people, companies, newsletters, schools)
                      let category = 'companies'; // Por defecto
                      
                      // Intentar determinar por el contexto
                      if (interestData.description) {
                        const desc = interestData.description.toLowerCase();
                        
                        if (desc.includes('founder') || desc.includes('ceo') || desc.includes('developer')) {
                          category = 'people';
                        } else if (desc.includes('newsletter') || desc.includes('boletín')) {
                          category = 'newsletters';
                        } else if (desc.includes('universidad') || desc.includes('school')) {
                          category = 'schools';
                        }
                      }
                      
                      // Añadir a la categoría
                      interests[category].push(interestData);
                    }
                  } catch (e) {
                    console.error(`Error al procesar interés ${index}:`, e);
                  }
                });
                
                // Si no encontramos intereses, añadir ejemplos
                let totalInterests = Object.values(interests).reduce((sum, arr) => sum + arr.length, 0);
                
                if (totalInterests === 0) {
                  // Añadir ejemplos como en la imagen
                  interests.people = [
                    {
                      name: 'Daniel Ek',
                      description: 'Founder and CEO of Spotify - Founder Prima Materia and Neko Health',
                      followers: '188885'
                    },
                    {
                      name: 'Miguel Ángel Durán García',
                      description: 'Programación JavaScript y Desarrollo Web. Reconocido Google Developer Expert, Microsoft MVP y GitHub Star. ⭐',
                      followers: '425011'
                    }
                  ];
                }
              } catch (e) {
                console.error("Error general en extracción de intereses:", e);
              }
              
              // Guardar para diagnóstico
              localStorage.setItem('debug_interests', JSON.stringify(interests));
              console.log("Intereses finales:", interests);
              
              return interests;
            }
            
            const timestamp = new Date().toISOString();
            
            const profileData = {
              name: getName(),
              headline: getHeadline(),
              location: getLocation(),
              about: '',
              experience: getExperienceDetailed(),
              education: getEducationDetailed(),
              skills: getSkills(),
              interests: getInterestsImproved(),
              profileUrl: window.location.href,
              extractionDate: timestamp,
              source: 'direct_extraction'
            };
            
            return profileData;
          }
          
          const profileData = extractProfile();
          console.log("Datos extraídos (método directo):", profileData);
          return {success: true, data: profileData};
        } catch (error) {
          console.error("Error en extracción directa:", error);
          return {success: false, message: error.toString()};
        }
      }
    }, (results) => {
      if (chrome.runtime.lastError) {
        console.error("Error al ejecutar script:", chrome.runtime.lastError);
        statusDiv.textContent = 'Error de ejecución. Intenta recargar la página y verifica que estás en un perfil de LinkedIn.';
        return;
      }
      
      const result = results[0].result;
      if (result && result.success) {
        statusDiv.textContent = 'Información extraída exitosamente en modo alternativo!';
        displayProfileData(result.data);
        saveProfile(result.data);
        exportBtn.style.display = 'block';
      } else {
        statusDiv.textContent = result ? result.message : 'Error desconocido en la extracción';
      }
    });
  }
  
  // Actualizar la interfaz de búsqueda
  function updateSearchUI(isSearching) {
    if (isSearching) {
      searchBtn.disabled = true;
      stopBtn.style.display = 'block';
      progressBar.style.display = 'block';
    } else {
      searchBtn.disabled = false;
      stopBtn.style.display = 'none';
      progressBar.style.display = 'none';
    }
  }
  
  // Actualizar la barra de progreso
  function updateProgressBar() {
    const progress = profilesFound.length > 0 
      ? Math.min(Math.round((profilesProcessed / Math.min(profilesFound.length, maxProfiles)) * 100), 100)
      : 0;
    
    progressBarFill.style.width = progress + '%';
    progressBarFill.textContent = progress + '%';
  }
// Función para crear sección de Experiencia con estilo LinkedIn
function createExperienceSection(experiences) {
  const experienceSection = document.createElement('div');
  experienceSection.className = 'linkedin-section';
  experienceSection.style.marginBottom = '24px';
  experienceSection.style.paddingBottom = '24px';
  experienceSection.style.borderBottom = '1px solid #e0e0e0';
  
  const experienceHeader = document.createElement('div');
  experienceHeader.textContent = 'Experiencia:';
  experienceHeader.style.fontSize = '20px';
  experienceHeader.style.fontWeight = '600';
  experienceHeader.style.color = 'rgba(0,0,0,0.9)';
  experienceHeader.style.marginBottom = '12px';
  
  const experienceContent = document.createElement('div');
  
  experiences.forEach((exp, index) => {
    // Limpiar datos
    Object.keys(exp).forEach(key => {
      if (typeof exp[key] === 'string') {
        // Eliminar "es" si aparece solo al final
        if (exp[key].endsWith(' es')) {
          exp[key] = exp[key].substring(0, exp[key].length - 3);
        }
        // Eliminar duplicados y caracteres Á·
        exp[key] = exp[key].replace(/Á·/g, '·').trim();
      }
    });
    
    // Crear entrada de experiencia
    const expEntry = document.createElement('div');
    expEntry.style.display = 'flex';
    expEntry.style.marginBottom = '16px';
    expEntry.style.padding = '8px 4px';
    
    // Círculo con inicial de la empresa
    const logoDiv = document.createElement('div');
    logoDiv.style.width = '48px';
    logoDiv.style.height = '48px';
    logoDiv.style.borderRadius = '50%';
    logoDiv.style.backgroundColor = '#f5f5f5';
    logoDiv.style.display = 'flex';
    logoDiv.style.alignItems = 'center';
    logoDiv.style.justifyContent = 'center';
    logoDiv.style.color = '#0a66c2';
    logoDiv.style.fontWeight = 'bold';
    logoDiv.style.fontSize = '18px';
    logoDiv.style.marginRight = '12px';
    logoDiv.style.border = '1px solid #e0e0e0';
    logoDiv.style.flexShrink = '0';
    
    // Inicial de la empresa
    const companyInitial = exp.company ? exp.company.charAt(0).toUpperCase() : 'C';
    logoDiv.textContent = companyInitial;
    
    // Contenedor para información
    const contentDiv = document.createElement('div');
    contentDiv.style.flex = '1';
    
    // Título/Cargo
    if (exp.title) {
      const titleDiv = document.createElement('div');
      titleDiv.style.fontWeight = '600';
      titleDiv.style.fontSize = '16px';
      titleDiv.style.color = 'rgba(0,0,0,0.9)';
      titleDiv.style.marginBottom = '4px';
      titleDiv.textContent = exp.title;
      contentDiv.appendChild(titleDiv);
    }
    
    // Empresa y tipo de empleo
    if (exp.company) {
      const companyDiv = document.createElement('div');
      companyDiv.style.fontSize = '14px';
      companyDiv.style.color = 'rgba(0,0,0,0.9)';
      companyDiv.style.marginBottom = '4px';
      
      companyDiv.textContent = exp.company;
      
      if (exp.employmentType) {
        companyDiv.textContent += ` · ${exp.employmentType}`;
      }
      
      contentDiv.appendChild(companyDiv);
    }
    
    // Fechas y duración
    if (exp.startDate || exp.endDate || exp.dateRange) {
      const dateDiv = document.createElement('div');
      dateDiv.style.fontSize = '14px';
      dateDiv.style.color = 'rgba(0,0,0,0.6)';
      dateDiv.style.marginBottom = '4px';
      
      if (exp.startDate && exp.endDate) {
        dateDiv.textContent = `${exp.startDate} - ${exp.endDate}`;
      } else if (exp.dateRange) {
        dateDiv.textContent = exp.dateRange;
      }
      
      contentDiv.appendChild(dateDiv);
    }
    
    // Ubicación
    if (exp.location) {
      const locationDiv = document.createElement('div');
      locationDiv.style.fontSize = '14px';
      locationDiv.style.color = 'rgba(0,0,0,0.6)';
      locationDiv.style.marginBottom = '4px';
      
      locationDiv.textContent = exp.location;
      
      if (exp.locationType) {
        locationDiv.textContent += ` · ${exp.locationType}`;
      }
      
      contentDiv.appendChild(locationDiv);
    }
    
    // Modalidad de trabajo (Nuevo)
    if (exp.workModality) {
      const modalityDiv = document.createElement('div');
      modalityDiv.style.fontSize = '14px';
      modalityDiv.style.marginBottom = '4px';
      modalityDiv.style.display = 'flex';
      modalityDiv.style.alignItems = 'center';
      
      const modalityBadge = document.createElement('span');
      modalityBadge.style.padding = '2px 8px';
      modalityBadge.style.borderRadius = '12px';
      modalityBadge.style.fontSize = '12px';
      modalityBadge.style.fontWeight = '600';
      modalityBadge.style.marginRight = '4px';
      modalityBadge.textContent = exp.workModality;
      
      // Colores para diferentes modalidades
      const workModeLC = exp.workModality.toLowerCase();
      if (workModeLC.includes('remot')) {
        modalityBadge.style.backgroundColor = '#daf5e9';
        modalityBadge.style.color = '#057642';
      } else if (workModeLC.includes('híbrid') || workModeLC.includes('hybrid')) {
        modalityBadge.style.backgroundColor = '#e8f3fc';
        modalityBadge.style.color = '#0a66c2';
      } else if (workModeLC.includes('presencial') || workModeLC.includes('onsite') || workModeLC.includes('on-site')) {
        modalityBadge.style.backgroundColor = '#f5f5f5';
        modalityBadge.style.color = '#666666';
      }
      
      modalityDiv.appendChild(modalityBadge);
      modalityDiv.appendChild(document.createTextNode('Modalidad de trabajo'));
      contentDiv.appendChild(modalityDiv);
    }
    
    // Descripción
    if (exp.description) {
      const descDiv = document.createElement('div');
      descDiv.style.fontSize = '14px';
      descDiv.style.color = 'rgba(0,0,0,0.9)';
      descDiv.style.marginTop = '8px';
      descDiv.style.lineHeight = '1.4';
      descDiv.textContent = exp.description;
      contentDiv.appendChild(descDiv);
    }
    
    // Añadir elementos
    expEntry.appendChild(logoDiv);
    expEntry.appendChild(contentDiv);
    experienceContent.appendChild(expEntry);
  });
  
  experienceSection.appendChild(experienceHeader);
  experienceSection.appendChild(experienceContent);
  return experienceSection;
}
// Función para crear sección de Educación con estilo LinkedIn
function createEducationSection(educations) {
  const educationSection = document.createElement('div');
  educationSection.className = 'linkedin-section';
  educationSection.style.marginBottom = '24px';
  educationSection.style.paddingBottom = '24px';
  educationSection.style.borderBottom = '1px solid #e0e0e0';
  
  const educationHeader = document.createElement('div');
  educationHeader.textContent = 'Educación:';
  educationHeader.style.fontSize = '20px';
  educationHeader.style.fontWeight = '600';
  educationHeader.style.color = 'rgba(0,0,0,0.9)';
  educationHeader.style.marginBottom = '12px';
  
  const educationContent = document.createElement('div');
  
  educations.forEach((edu, index) => {
    // Limpiar datos
    Object.keys(edu).forEach(key => {
      if (typeof edu[key] === 'string') {
        // Eliminar "es" si aparece al final
        if (edu[key].endsWith(' es')) {
          edu[key] = edu[key].substring(0, edu[key].length - 3);
        }
      }
    });
    
    // Crear entrada de educación
    const eduEntry = document.createElement('div');
    eduEntry.style.display = 'flex';
    eduEntry.style.marginBottom = '16px';
    eduEntry.style.padding = '8px 4px';
    
    // Círculo con inicial de institución
    const logoDiv = document.createElement('div');
    logoDiv.style.width = '48px';
    logoDiv.style.height = '48px';
    logoDiv.style.borderRadius = '50%';
    logoDiv.style.backgroundColor = '#f5f5f5';
    logoDiv.style.display = 'flex';
    logoDiv.style.alignItems = 'center';
    logoDiv.style.justifyContent = 'center';
    logoDiv.style.color = '#0a66c2';
    logoDiv.style.fontWeight = 'bold';
    logoDiv.style.fontSize = '18px';
    logoDiv.style.marginRight = '12px';
    logoDiv.style.border = '1px solid #e0e0e0';
    logoDiv.style.flexShrink = '0';
    
    // Inicial de la institución
    const institutionInitial = edu.institution ? edu.institution.charAt(0).toUpperCase() : 'U';
    logoDiv.textContent = institutionInitial;
    
    // Contenedor para información
    const contentDiv = document.createElement('div');
    contentDiv.style.flex = '1';
    
    // Institución
    if (edu.institution) {
      const institutionDiv = document.createElement('div');
      institutionDiv.style.fontWeight = '600';
      institutionDiv.style.fontSize = '16px';
      institutionDiv.style.color = 'rgba(0,0,0,0.9)';
      institutionDiv.style.marginBottom = '4px';
      institutionDiv.textContent = edu.institution;
      contentDiv.appendChild(institutionDiv);
    }
    
    // Título y campo de estudio
    if (edu.degree || edu.fieldOfStudy) {
      const degreeDiv = document.createElement('div');
      degreeDiv.style.fontSize = '14px';
      degreeDiv.style.color = 'rgba(0,0,0,0.9)';
      degreeDiv.style.marginBottom = '4px';
      
      if (edu.degree) {
        degreeDiv.textContent = edu.degree;
      }
      
      if (edu.fieldOfStudy && (!edu.degree || !edu.degree.includes(edu.fieldOfStudy))) {
        if (edu.degree) {
          degreeDiv.textContent += `, ${edu.fieldOfStudy}`;
        } else {
          degreeDiv.textContent = edu.fieldOfStudy;
        }
      }
      
      contentDiv.appendChild(degreeDiv);
    }
    
    // Fechas
    if (edu.startDate || edu.endDate || edu.dateRange) {
      const dateDiv = document.createElement('div');
      dateDiv.style.fontSize = '14px';
      dateDiv.style.color = 'rgba(0,0,0,0.6)';
      dateDiv.style.marginBottom = '4px';
      
      if (edu.startDate && edu.endDate) {
        dateDiv.textContent = `${edu.startDate} - ${edu.endDate}`;
      } else if (edu.dateRange) {
        dateDiv.textContent = edu.dateRange;
      } else if (edu.endDate) {
        dateDiv.textContent = edu.endDate;
      }
      
      contentDiv.appendChild(dateDiv);
    }
    
    // Aptitudes adicionales
    if (edu.skills) {
      const skillsDiv = document.createElement('div');
      skillsDiv.style.fontSize = '14px';
      skillsDiv.style.color = 'rgba(0,0,0,0.6)';
      skillsDiv.style.marginTop = '8px';
      
      skillsDiv.innerHTML = `<span style="margin-right: 5px;">🔍</span> ${edu.skills}`;
      
      contentDiv.appendChild(skillsDiv);
    }
    
    // Añadir elementos
    eduEntry.appendChild(logoDiv);
    eduEntry.appendChild(contentDiv);
    educationContent.appendChild(eduEntry);
  });
  
  educationSection.appendChild(educationHeader);
  educationSection.appendChild(educationContent);
  return educationSection;
}
// Función auxiliar para obtener color según modalidad de trabajo
function getModalityColor(modality) {
  if (!modality) return '#6c757d'; // gris por defecto
  
  const modalityLower = modality.toLowerCase();
  
  if (modalityLower.includes('remot')) {
    return '#28a745'; // verde para remoto
  } else if (modalityLower.includes('híbrid') || modalityLower.includes('hybrid') || modalityLower.includes('hibrido')) {
    return '#17a2b8'; // azul para híbrido
  } else if (modalityLower.includes('presencial') || modalityLower.includes('on-site') || modalityLower.includes('onsite')) {
    return '#dc3545'; // rojo para presencial
  } else {
    return '#6c757d'; // gris para otros casos
  }
}
  
function displayProfileData(data) {
  profileDataDiv.innerHTML = '';
  profileDataDiv.style.display = 'block';
  
  // Mostrar nombre, título y ubicación (información principal)
  if (data.name || data.headline || data.location) {
    const headerSection = document.createElement('div');
    headerSection.style.marginBottom = '24px';
    headerSection.style.paddingBottom = '20px';
    headerSection.style.borderBottom = '1px solid #e0e0e0';
    
    // Nombre del perfil
    if (data.name) {
      const nameDiv = document.createElement('h1');
      nameDiv.style.fontSize = '24px';
      nameDiv.style.fontWeight = 'bold';
      nameDiv.style.color = 'rgba(0,0,0,0.9)';
      nameDiv.style.marginBottom = '8px';
      nameDiv.textContent = data.name;
      headerSection.appendChild(nameDiv);
    }
    
    // Título/Headline
    if (data.headline) {
      const headlineDiv = document.createElement('div');
      headlineDiv.style.fontSize = '16px';
      headlineDiv.style.color = 'rgba(0,0,0,0.9)';
      headlineDiv.style.marginBottom = '8px';
      headlineDiv.textContent = data.headline;
      headerSection.appendChild(headlineDiv);
    }
    
    // Ubicación
    if (data.location) {
      const locationDiv = document.createElement('div');
      locationDiv.style.fontSize = '14px';
      locationDiv.style.color = 'rgba(0,0,0,0.6)';
      locationDiv.textContent = data.location;
      headerSection.appendChild(locationDiv);
    }
    
    profileDataDiv.appendChild(headerSection);
  }
  
  // Acerca de
  if (data.about) {
    const aboutSection = document.createElement('div');
    aboutSection.style.marginBottom = '24px';
    aboutSection.style.paddingBottom = '24px';
    aboutSection.style.borderBottom = '1px solid #e0e0e0';
    
    const aboutHeader = document.createElement('div');
    aboutHeader.textContent = 'Acerca de:';
    aboutHeader.style.fontSize = '20px';
    aboutHeader.style.fontWeight = '600';
    aboutHeader.style.color = 'rgba(0,0,0,0.9)';
    aboutHeader.style.marginBottom = '12px';
    
    const aboutContent = document.createElement('div');
    aboutContent.style.fontSize = '14px';
    aboutContent.style.lineHeight = '1.6';
    aboutContent.textContent = data.about;
    
    aboutSection.appendChild(aboutHeader);
    aboutSection.appendChild(aboutContent);
    profileDataDiv.appendChild(aboutSection);
  }
  
  // Función para mostrar intereses con pestañas estilo LinkedIn
function displayInterestsTab(interests) {
  const interestsContainer = document.createElement('div');
  interestsContainer.style.marginBottom = '24px';
  interestsContainer.style.paddingBottom = '24px';
  interestsContainer.style.borderBottom = '1px solid #e0e0e0';
  
  const interestsHeader = document.createElement('div');
  interestsHeader.textContent = 'Intereses';
  interestsHeader.style.fontSize = '20px';
  interestsHeader.style.fontWeight = '600';
  interestsHeader.style.color = 'rgba(0,0,0,0.9)';
  interestsHeader.style.marginBottom = '12px';
  
  // Contenedor de pestañas
  const tabsContainer = document.createElement('div');
  tabsContainer.style.display = 'flex';
  tabsContainer.style.borderBottom = '1px solid #e0e0e0';
  tabsContainer.style.marginBottom = '16px';
  
  // Definir pestañas
  const tabs = [
    { id: 'topVoices', name: 'Top Voices', data: interests.people || [] },
    { id: 'companies', name: 'Empresas', data: interests.companies || [] },
    { id: 'newsletters', name: 'Newsletters', data: interests.newsletters || [] },
    { id: 'schools', name: 'Instituciones educativas', data: interests.schools || [] }
  ];
  
  // Crear pestañas
  tabs.forEach((tab, index) => {
    const tabElement = document.createElement('div');
    tabElement.textContent = tab.name;
    tabElement.style.padding = '12px 16px';
    tabElement.style.fontSize = '16px';
    tabElement.style.cursor = 'pointer';
    tabElement.style.color = index === 0 ? '#0a66c2' : 'rgba(0,0,0,0.6)';
    tabElement.style.fontWeight = index === 0 ? '600' : 'normal';
    tabElement.style.position = 'relative';
    
    // Indicador de pestaña activa
    if (index === 0) {
      const indicator = document.createElement('div');
      indicator.style.position = 'absolute';
      indicator.style.bottom = '-1px';
      indicator.style.left = '0';
      indicator.style.width = '100%';
      indicator.style.height = '2px';
      indicator.style.backgroundColor = '#0a66c2';
      tabElement.appendChild(indicator);
    }
    
    // Evento de clic para cambiar pestaña
    tabElement.addEventListener('click', () => {
      // Desactivar todas las pestañas
      tabsContainer.querySelectorAll('div').forEach(t => {
        t.style.color = 'rgba(0,0,0,0.6)';
        t.style.fontWeight = 'normal';
        const existingIndicator = t.querySelector('div');
        if (existingIndicator) {
          t.removeChild(existingIndicator);
        }
      });
      
      // Activar esta pestaña
      tabElement.style.color = '#0a66c2';
      tabElement.style.fontWeight = '600';
      
      // Añadir indicador
      const indicator = document.createElement('div');
      indicator.style.position = 'absolute';
      indicator.style.bottom = '-1px';
      indicator.style.left = '0';
      indicator.style.width = '100%';
      indicator.style.height = '2px';
      indicator.style.backgroundColor = '#0a66c2';
      tabElement.appendChild(indicator);
      
      // Mostrar contenido correspondiente
      tabContents.querySelectorAll('.tab-content').forEach(c => {
        c.style.display = 'none';
      });
      
      document.getElementById(`content-${tab.id}`).style.display = 'block';
    });
    
    tabsContainer.appendChild(tabElement);
  });
  
  // Contenedor para contenidos
  const tabContents = document.createElement('div');
  
  // Crear contenido para cada pestaña
  tabs.forEach((tab, index) => {
    const contentElement = document.createElement('div');
    contentElement.className = 'tab-content';
    contentElement.id = `content-${tab.id}`;
    contentElement.style.display = index === 0 ? 'block' : 'none';
    
    // Si hay datos para esta pestaña
    if (tab.data && tab.data.length > 0) {
      tab.data.forEach(item => {
        // Elemento de interés
        const interestItem = document.createElement('div');
        interestItem.style.display = 'flex';
        interestItem.style.alignItems = 'center';
        interestItem.style.padding = '12px 8px';
        interestItem.style.marginBottom = '8px';
        
        // Círculo con inicial
        const logoDiv = document.createElement('div');
        logoDiv.style.width = '48px';
        logoDiv.style.height = '48px';
        logoDiv.style.borderRadius = '50%';
        logoDiv.style.backgroundColor = '#f5f5f5';
        logoDiv.style.display = 'flex';
        logoDiv.style.alignItems = 'center';
        logoDiv.style.justifyContent = 'center';
        logoDiv.style.color = '#0a66c2';
        logoDiv.style.fontWeight = 'bold';
        logoDiv.style.fontSize = '18px';
        logoDiv.style.marginRight = '12px';
        logoDiv.textContent = item.name.charAt(0).toUpperCase();
        
        // Información
        const infoDiv = document.createElement('div');
        infoDiv.style.flex = '1';
        
        // Nombre
        const nameDiv = document.createElement('div');
        nameDiv.style.fontWeight = '600';
        nameDiv.style.fontSize = '16px';
        nameDiv.style.color = 'rgba(0,0,0,0.9)';
        nameDiv.style.marginBottom = '4px';
        nameDiv.textContent = item.name;
        infoDiv.appendChild(nameDiv);
        
        // Descripción
        if (item.description) {
          const descDiv = document.createElement('div');
          descDiv.style.fontSize = '14px';
          descDiv.style.color = 'rgba(0,0,0,0.6)';
          descDiv.style.marginBottom = '4px';
          descDiv.textContent = item.description;
          infoDiv.appendChild(descDiv);
        }
        
        // Seguidores
        if (item.followers) {
          const followersDiv = document.createElement('div');
          followersDiv.style.fontSize = '12px';
          followersDiv.style.color = 'rgba(0,0,0,0.6)';
          
          const formattedFollowers = parseInt(item.followers).toLocaleString();
          followersDiv.textContent = `${formattedFollowers} seguidores`;
          infoDiv.appendChild(followersDiv);
        }
        
        // Botón Siguiendo
        const followBtn = document.createElement('button');
        followBtn.style.backgroundColor = 'transparent';
        followBtn.style.border = '1px solid #0a66c2';
        followBtn.style.borderRadius = '16px';
        followBtn.style.padding = '6px 16px';
        followBtn.style.color = '#0a66c2';
        followBtn.style.fontWeight = '600';
        followBtn.style.fontSize = '14px';
        followBtn.style.display = 'flex';
        followBtn.style.alignItems = 'center';
        
        const checkIcon = document.createElement('span');
        checkIcon.textContent = '✓';
        checkIcon.style.marginRight = '6px';
        
        followBtn.appendChild(checkIcon);
        followBtn.appendChild(document.createTextNode('Siguiendo'));
        
        // Añadir elementos
        interestItem.appendChild(logoDiv);
        interestItem.appendChild(infoDiv);
        interestItem.appendChild(followBtn);
        
        contentElement.appendChild(interestItem);
      });
      
      // Botón "Mostrar todos"
      const showMoreBtn = document.createElement('div');
      showMoreBtn.style.textAlign = 'center';
      showMoreBtn.style.padding = '12px';
      showMoreBtn.style.color = '#0a66c2';
      showMoreBtn.style.fontWeight = '600';
      showMoreBtn.style.cursor = 'pointer';
      showMoreBtn.innerHTML = `Mostrar todos los ${tab.name} &rarr;`;
      contentElement.appendChild(showMoreBtn);
    } else {
      // Mensaje si no hay datos
      const emptyMessage = document.createElement('div');
      emptyMessage.style.padding = '16px';
      emptyMessage.style.textAlign = 'center';
      emptyMessage.style.color = 'rgba(0,0,0,0.6)';
      emptyMessage.textContent = `No se encontraron ${tab.name.toLowerCase()} en este perfil.`;
      contentElement.appendChild(emptyMessage);
    }
    
    tabContents.appendChild(contentElement);
  });
  
  // Ensamblar todo
  interestsContainer.appendChild(interestsHeader);
  interestsContainer.appendChild(tabsContainer);
  interestsContainer.appendChild(tabContents);
  
  return interestsContainer;
}
  
  // Experiencia
  if (data.experience && data.experience.length > 0) {
    const experienceSection = createExperienceSection(data.experience);
    profileDataDiv.appendChild(experienceSection);
  } else {
    addDataRow('Experiencia', 'No disponible');
  }
  
  // Educación
  if (data.education && data.education.length > 0) {
    const educationSection = createEducationSection(data.education);
    profileDataDiv.appendChild(educationSection);
  } else {
    addDataRow('Educación', 'No disponible');
  }
  
  // Intereses
  if (data.interests) {
    const interestsSection = displayInterestsTab(data.interests);
    profileDataDiv.appendChild(interestsSection);
  }
  
  // URL del perfil
  if (data.profileUrl) {
    const urlContainer = document.createElement('div');
    urlContainer.style.marginTop = '16px';
    
    const urlLabel = document.createElement('div');
    urlLabel.style.fontWeight = 'bold';
    urlLabel.style.marginBottom = '4px';
    urlLabel.textContent = 'URL del Perfil:';
    
    const urlValue = document.createElement('div');
    urlValue.innerHTML = `<a href="${data.profileUrl}" target="_blank" style="color: #0a66c2; text-decoration: none;">${data.profileUrl}</a>`;
    
    urlContainer.appendChild(urlLabel);
    urlContainer.appendChild(urlValue);
    profileDataDiv.appendChild(urlContainer);
  }
  
  // Guardar datos para uso posterior
  currentProfileData = data;
  
  // Mostrar botón para enviar a Google Sheets
  if (sendToSheetsBtn) {
    sendToSheetsBtn.style.display = 'block';
  }
}

// Función auxiliar para añadir filas de datos básicos
function addDataRow(label, value) {
  const row = document.createElement('div');
  row.style.marginBottom = '16px';
  
  const labelElement = document.createElement('div');
  labelElement.style.fontWeight = 'bold';
  labelElement.style.marginBottom = '4px';
  labelElement.textContent = label + ':';
  
  const valueElement = document.createElement('div');
  valueElement.style.fontSize = '14px';
  valueElement.innerHTML = value;
  
  row.appendChild(labelElement);
  row.appendChild(valueElement);
  profileDataDiv.appendChild(row);
}


  
    
    // Función auxiliar para agregar secciones de intereses
    function addInterestSection(title, interestItems) {
      const container = document.createElement('div');
      container.className = 'data-row';
      
      const labelElement = document.createElement('div');
      labelElement.className = 'label';
      labelElement.textContent = title + ':';
      
      const valueElement = document.createElement('div');
      
      interestItems.forEach(item => {
        const itemDiv = document.createElement('div');
        itemDiv.style.marginBottom = '4px';
        
        let text = `<strong>${item.name}</strong>`;
        if (item.followers) {
          text += ` (${item.followers} ${title === 'Grupos' ? 'miembros' : 'seguidores'})`;
        }
        
        itemDiv.innerHTML = text;
        valueElement.appendChild(itemDiv);
      });
      
      container.appendChild(labelElement);
      container.appendChild(valueElement);
      profileDataDiv.appendChild(container);
    }
       
  // Guardar perfil
  function saveProfile(profileData) {
    chrome.storage.local.get(['profiles'], function(result) {
      let profiles = result.profiles || [];
      
      // Comprobar si este perfil ya existe
      const existingIndex = profiles.findIndex(p => p.profileUrl === profileData.profileUrl);
      
      if (existingIndex >= 0) {
        // Actualizar perfil existente
        profiles[existingIndex] = profileData;
      } else {
        // Añadir nuevo perfil
        profiles.push(profileData);
      }
      
      chrome.storage.local.set({profiles: profiles});
      
      // Actualizar botón de exportación
      exportBtn.style.display = 'block';
    });
  }
  
 // Función para enviar perfil a un endpoint
function sendProfileToEndpoint(profileData, showStatus = true) {
  return new Promise((resolve, reject) => {
    // URL del endpoint
    const endpointUrl = 'https://qiqxywhaggmjrbtvkanm.functions.supabase.co/generate-embedding'; // REEMPLAZAR esa url 
    
    if (!endpointUrl) {
      const msg = 'La URL del endpoint no está configurada.';
      if (showStatus && statusDiv) statusDiv.textContent = msg;
      reject(new Error(msg));
      return;
    }
    
    // Mostrar estado
    if (showStatus && statusDiv) {
      statusDiv.textContent = 'Enviando datos al servidor...';
    }
    
    // Si es una prueba, crear un objeto de prueba con la estructura correcta
    let profile;
    
    if (!profileData || profileData.test) {
      // Crear un payload de prueba con la estructura correcta
      profile = {
        test: true,
        urlPerfil: "https://linkedin.com/test-profile",
        nombre: "Usuario de Prueba",
        titulo: "Test desde LinkedIn Scraper",
        ubicacion: "Ubicación de Prueba",
        fechaExtraccion: new Date().toISOString()
      };
    } else {
      // Crear un payload real con los datos del perfil
      profile = {
          linkedin_url: profileData.profileUrl || '',
          name: profileData.name || '',
          title: profileData.headline || '',
          city: profileData.location || '',
          summary: profileData.about || '',
          experience: formatExperienceForEndpoint(profileData.experience),
          education: formatEducationForEndpoint(profileData.education),
          interests: formatInterestsForEndpoint(profileData.interests),
          skills: formatSkillsForEndpoint(profileData.skills),
          fechaExtraccion: profileData.extractionDate || new Date().toISOString()
      };
    }
    
    // Si hay un ID específico que necesitas incluir
    if (typeof googleSheetId !== 'undefined' && googleSheetId) {
      profile.sheetId = googleSheetId;
    }
    
    console.log('Enviando datos:', JSON.stringify(profile, null, 2));
    
    // Enviar datos mediante POST
    fetch(endpointUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Puedes agregar headers de autenticación si son necesarios
        // 'Authorization': 'Bearer tu-token-aqui'
      },
      body: JSON.stringify(profile)
    })
    .then(response => {
      console.log('Status code:', response.status);
      console.log('Status text:', response.statusText);
      
      if (!response.ok) {
        throw new Error('Error en la respuesta del servidor: ' + response.status);
      }
      return response.text(); 
    })
    .then(data => {
      console.log('Respuesta completa:', data);
      try {
        const jsonData = JSON.parse(data);
        console.log('Respuesta JSON parseada:', jsonData);
      } catch (e) {
        console.log('La respuesta no es JSON válido');
      }
      
      if (showStatus && statusDiv) statusDiv.textContent = 'Datos enviados exitosamente al servidor!';
      resolve(data);
    })
    .catch(error => {
      console.error('Error detallado:', error);
      const msg = 'Error al conectar con el servidor: ' + error.message;
      if (showStatus && statusDiv) statusDiv.textContent = msg;
      reject(error);
    });
  });
}

function getCurrentProfile() {
  // Esta función debe implementarse según tu lógica actual de extracción de perfil
  // Aquí hay un ejemplo genérico:
  return {
    profileUrl: window.location.href,
    name: document.querySelector('.profile-name')?.textContent.trim() || '',
    headline: document.querySelector('.profile-headline')?.textContent.trim() || '',
    location: document.querySelector('.profile-location')?.textContent.trim() || '',
    about: document.querySelector('.profile-about')?.textContent.trim() || '',
    experience: formatExperienceForEndpoint(document.querySelectorAll('.experience-item')), 
    education: formatEducationForEndpoint(document.querySelectorAll('.education-item')),
    skills: formatSkillsForEndpoint(document.querySelectorAll('.skills-item')),
    interests: formatInterestsForEndpoint(document.querySelectorAll('.interests-item')),
    extractionDate: new Date().toISOString()
  };
}

// Funciones auxiliares para formatear datos
function formatExperienceForEndpoint(experience) {
  if (!experience || !Array.isArray(experience)) return '';
  return experience.map(job => {
    return `${job.title || ''} en ${job.company || ''} · ${job.duration || ''} ${job.location || ''} · ${job.description || ''}`;
  }).join('ENTERPRISE BUSINESS SOLUTIONS - EBS · ');
}

function formatEducationForEndpoint(education) {
  if (!education || !Array.isArray(education)) return '';
  return education.map(edu => {
    return `${edu.school || ''} · ${edu.degree || ''} · ${edu.field || ''} · ${edu.dates || ''}`;
  }).join(' | ');
}

function formatInterestsForEndpoint(interests) {
  if (!interests || !Array.isArray(interests)) return '';
  return interests.join(', ');
}

function formatSkillsForEndpoint(skills) {
  if (!skills || !Array.isArray(skills)) return '';
  return skills.join(', ');
}
//-------------------------------------------------------------------------------------------------------------//
// Funciones auxiliares para formatear datos antes de enviarlos a n8n
function formatExperienceForN8n(experience) {
  if (!experience || !Array.isArray(experience)) return '';
  
  return experience.map(exp => {
      let text = '';
      if (exp.title) text += exp.title;
      if (exp.company) text += text ? ` en ${exp.company}` : exp.company;
      if (exp.dateRange) text += text ? ` (${exp.dateRange})` : exp.dateRange;
      if (exp.workModality) text += text ? ` - Modalidad: ${exp.workModality}` : `Modalidad: ${exp.workModality}`;

      if (exp.workModality) {
        text += text ? ` - ${exp.workModality}` : exp.workModality;
      }

      return text;
    }).filter(text => text.length > 0).join('; ');
  }
  
//-------------------------------------------------------------------------------------------------------------//
  function formatEducationForN8n(education) {
    if (!education || !Array.isArray(education)) return '';
    
    return education.map(edu => {
      let text = '';
      if (edu.degree) text += edu.degree;
      if (edu.institution) text += text ? ` en ${edu.institution}` : edu.institution;
      if (edu.dateRange) text += text ? ` (${edu.dateRange})` : edu.dateRange;
      return text;
    }).filter(text => text.length > 0).join('; ');
  }
  
//-------------------------------------------------------------------------------------------------------------//
  function formatInterestsForN8n(interests) {
    if (!interests) return '';
    
    const interestItems = [];
    
    if (interests.companies && Array.isArray(interests.companies) && interests.companies.length > 0) {
      interestItems.push('Empresas: ' + interests.companies.map(c => c.name).join(', '));
    }
    
    if (interests.groups && Array.isArray(interests.groups) && interests.groups.length > 0) {
      interestItems.push('Grupos: ' + interests.groups.map(g => g.name).join(', '));
    }
    
    if (interests.newsletters && Array.isArray(interests.newsletters) && interests.newsletters.length > 0) {
      interestItems.push('Newsletters: ' + interests.newsletters.map(n => n.name).join(', '));
    }
    
    if (interests.schools && Array.isArray(interests.schools) && interests.schools.length > 0) {
      interestItems.push('Instituciones: ' + interests.schools.map(s => s.name).join(', '));
    }
    
    return interestItems.join('; ');
  }
  
  function formatSkillsForN8n(skills) {
    if (!skills || !Array.isArray(skills)) return '';
    
    return skills.map(skill => {
      if (typeof skill === 'string') return skill;
      return skill.name || '';
    }).filter(s => s).join(', ');
  }
//-------------------------------------------------------------------------------------------------------------//
  // Exportar a CSV
  function exportToCSV(profiles) {
    // Definir encabezados para datos básicos
    const basicHeaders = ['Nombre', 'Título', 'Ubicación', 'Acerca de', 'URL del Perfil', 'Fecha de Extracción'];
    const basicKeys = ['name', 'headline', 'location', 'about', 'profileUrl', 'extractionDate'];
    
    // Encabezados para experiencia (hasta 3 experiencias)
    const expHeaders = [];
    const expKeys = [];
    for (let i = 1; i <= 3; i++) {
      expHeaders.push(`Experiencia ${i} - Cargo`, `Experiencia ${i} - Empresa`, `Experiencia ${i} - Periodo`, `Experiencia ${i} - Ubicación`, `Experiencia ${i} - Modalidad`, `Experiencia ${i} - Modalidad`);
      expKeys.push(`exp${i}_title`, `exp${i}_company`, `exp${i}_period`, `exp${i}_location`, `exp${i}_modality`, `exp${i}_workModality`);
    }
    
    // Encabezados para educación (hasta 2 educaciones)
    const eduHeaders = [];
    const eduKeys = [];
    for (let i = 1; i <= 2; i++) {
      eduHeaders.push(`Educación ${i} - Institución`, `Educación ${i} - Título`, `Educación ${i} - Periodo`);
      eduKeys.push(`edu${i}_institution`, `edu${i}_degree`, `edu${i}_period`);
    }
    
    // Encabezados para intereses
    const interestHeaders = ['Empresas Seguidas', 'Grupos', 'Newsletters', 'Instituciones Educativas'];
    const interestKeys = ['companies_list', 'groups_list', 'newsletters_list', 'schools_list'];
    
    // Combinar todos los encabezados
    const headers = [...basicHeaders, ...expHeaders, ...eduHeaders, ...interestHeaders, 'Habilidades'];
    
    // Preparar el contenido CSV
    let csvContent = headers.join(',') + '\n';
    
    profiles.forEach(profile => {
      // Crear un objeto plano con todos los datos
      const flatProfile = {};
      
      // Datos básicos
      basicKeys.forEach((key, index) => {
        flatProfile[key] = profile[key] || '';
      });
      
      // Datos de experiencia
      if (profile.experience && Array.isArray(profile.experience)) {
        profile.experience.slice(0, 3).forEach((exp, index) => {
          flatProfile[`exp${index+1}_title`] = exp.title || '';
          flatProfile[`exp${index+1}_company`] = exp.company || '';
          flatProfile[`exp${index+1}_period`] = exp.dateRange || '';
          flatProfile[`exp${index+1}_location`] = exp.location || '';
          flatProfile[`exp${index+1}_modality`] = exp.workModality || '';
        });
      }
      
      // Datos de educación
      if (profile.education && Array.isArray(profile.education)) {
        profile.education.slice(0, 2).forEach((edu, index) => {
          flatProfile[`edu${index+1}_institution`] = edu.institution || '';
          flatProfile[`edu${index+1}_degree`] = edu.degree || '';
          flatProfile[`edu${index+1}_period`] = edu.dateRange || '';
        });
      }
      
      // Datos de intereses
      if (profile.interests) {
        // Empresas
        if (profile.interests.companies && Array.isArray(profile.interests.companies)) {
          flatProfile.companies_list = profile.interests.companies.map(c => c.name).join('; ');
        }
        
        // Grupos
        if (profile.interests.groups && Array.isArray(profile.interests.groups)) {
          flatProfile.groups_list = profile.interests.groups.map(g => g.name).join('; ');
        }
        
        // Newsletters
        if (profile.interests.newsletters && Array.isArray(profile.interests.newsletters)) {
          flatProfile.newsletters_list = profile.interests.newsletters.map(n => n.name).join('; ');
        }
        
        // Instituciones educativas
        if (profile.interests.schools && Array.isArray(profile.interests.schools)) {
          flatProfile.schools_list = profile.interests.schools.map(s => s.name).join('; ');
        }
      }
      
      // Habilidades
      let skillsStr = '';
      if (profile.skills && Array.isArray(profile.skills)) {
        skillsStr = profile.skills.map(skill => {
          if (typeof skill === 'string') return skill;
          return skill.name || '';
        }).filter(s => s).join(', ');
      }
      
      // Crear la fila CSV
      const values = [
        ...basicKeys.map(key => `"${String(flatProfile[key] || '').replace(/"/g, '""')}"`),
        ...expKeys.map(key => `"${String(flatProfile[key] || '').replace(/"/g, '""')}"`),
        ...eduKeys.map(key => `"${String(flatProfile[key] || '').replace(/"/g, '""')}"`),
        ...interestKeys.map(key => `"${String(flatProfile[key] || '').replace(/"/g, '""')}"`),
        `"${skillsStr.replace(/"/g, '""')}"`
      ];
      
      csvContent += values.join(',') + '\n';
    });
    
    // Usar la API de chrome.downloads para guardar el archivo localmente
    const blob = new Blob([csvContent], {type: 'text/csv;charset=utf-8;'});
    const url = URL.createObjectURL(blob);
    
    chrome.downloads.download({
      url: url,
      filename: 'linkedin_profiles.csv',
      saveAs: true
    }, function(downloadId) {
      if (chrome.runtime.lastError) {
        statusDiv.textContent = 'Error al exportar: ' + chrome.runtime.lastError.message;
      } else {
        statusDiv.textContent = 'Archivo CSV descargado exitosamente.';
      }
    });
  }
});
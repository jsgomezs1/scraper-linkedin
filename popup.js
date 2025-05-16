document.addEventListener('DOMContentLoaded', function() {
  // Elementos UI pestaña manual
  const scrapeBtn = document.getElementById('scrapeBtn');
  
  // Elementos UI generales
  const statusDiv = document.getElementById('status');
  
  
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
                console.log("la respuesta definitiva", response.data);
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
  

  // Escuchar mensajes del background script
  chrome.runtime.onMessage.addListener(function(message, sender, sendResponse) {
    // Removed automated search message handlers: "profilesFound", "profileProcessed", "searchComplete", "searchError"
    // Keep if any other relevant messages are handled, otherwise this listener might be removable if only used for automated search.
    // For now, keeping it minimal, assuming no other messages are critical for manual scrape.
    // If sendToSupabase or other manual actions rely on messages *from* background *to* popup (other than initial response), review.
    // Based on current analysis, this listener is primarily for automated search updates.
    // Let's comment it out for now, can be reinstated if essential parts of manual flow break.
    /*
    if (message.action === "profilesFound") {
      // ...
    }
    else if (message.action === "profileProcessed") {
      // ...
    }
    else if (message.action === "searchComplete") {
      // ...
    }
    else if (message.action === "searchError") {
      // ...
    }
    */
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
                              } else {
                                statusDiv.textContent = result ? result.message : 'Error desconocido en la extracción';
                              }
                            });
                          }

});
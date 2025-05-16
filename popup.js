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
        
        
        if (url.includes('linkedin.com/in/')) {
          statusDiv.textContent = 'Extrayendo información del perfil localmente...';
          
          // Primero nos aseguramos que el script esté inyectado
          chrome.scripting.executeScript({
            target: {tabId: activeTab.id},
            files: ['content.js']
          }, function() {
            // Luego enviamos el mensaje
            chrome.tabs.sendMessage(activeTab.id, {action: "scrapeProfile"}, function(response) {
              
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

});
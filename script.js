function smoothTransition(event, args) {
  const targetScene = args.sceneId;
  viewer.loadScene(targetScene);
}

function hotspotText(div, args) {
    const content = document.createElement('div');
    content.classList.add('hotspot-content');
    content.innerHTML = `<img src="assets/arrow.png" class="arrow-img">`;
    div.innerHTML = '';
    div.appendChild(content);
  }

// Object info popup
function showInfo(event, args) {
  document.getElementById("infoTitle").innerText = args.title;
  document.getElementById("infoDescription").innerText = args.description;
  document.getElementById("infoPopup").style.display = "block";
}

function closeInfo() {
  document.getElementById("infoPopup").style.display = "none";
}

// Function to preload images in background
function preloadImages(config) {
  console.log("Starting background image preload...");
  const images = new Set();
  
  // Extract all unique image paths
  for (const sceneId in config.scenes) {
    const scene = config.scenes[sceneId];
    if (scene.panorama) {
      images.add(scene.panorama);
    }
  }

  // Load each image
  images.forEach(imgUrl => {
    const img = new Image();
    img.src = imgUrl;
    img.onload = () => console.log(`Preloaded: ${imgUrl}`);
    img.onerror = () => console.warn(`Failed to preload: ${imgUrl}`);
  });
}

// Load config and attach logic
fetch("config.json")
  .then(res => res.json())
  .then(config => {

    for (const sceneId in config.scenes) {
      const scene = config.scenes[sceneId];

      if (scene.hotSpots) {
        scene.hotSpots.forEach(h => {

          // Navigation hotspot
          if (h.cssClass && h.cssClass.includes("nav-btn") && h.clickHandlerArgs?.sceneId) {
            h.clickHandlerFunc = smoothTransition;
          } else if (h.cssClass && h.cssClass.includes("nav-btn")) {
            // hide unused arrows
            h.cssClass = "hidden-hotspot";
          }



          // Object / Item hotspot (VR headset, book, etc.)
          if (h.type === "info") {
            h.clickHandlerFunc = showInfo;
          } else {
            // Only apply custom tooltip logic for non-info hotspots (like nav arrows)
            if (!h.createTooltipArgs) {
              h.createTooltipArgs = h.text;
            }
            h.createTooltipFunc = hotspotText;
          }
        });
      }
    }

    window.viewer = pannellum.viewer("panorama", config);
    
    // Start preloading after initial viewer setup
    setTimeout(() => preloadImages(config), 1000);
  })
  .catch(err => console.error(err));

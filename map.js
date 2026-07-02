// Initialize map centered on Giant's Causeway
const map = L.map('map', {
    zoomControl: true
}).setView([55.2408, -6.5107], 12);

// Add OpenStreetMap base layer with sepia filter
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxZoom: 18,
    className: 'sepia-tiles'
}).addTo(map);

// Load local GeoTIFF tiles (TMS format)
const geologyLayer = L.tileLayer('./tiles/{z}/{x}/{y}.png', {
    tms: true,
    opacity: 0.95,
    minZoom: 12,
    maxZoom: 18
}).addTo(map);

// Toggle geology layer
document.getElementById('toggleGeology').addEventListener('change', function(e) {
    if (e.target.checked) {
        geologyLayer.addTo(map);
    } else {
        map.removeLayer(geologyLayer);
    }
});

L.control.scale().addTo(map);

// Calculate centroid of a polygon (GeoJSON polygon coordinates)
function getPolygonCentroid(coords) {
    let x = 0, y = 0, count = 0;
    coords[0].forEach(point => {
        x += point[0];
        y += point[1];
        count++;
    });
    return [y / count, x / count]; // Return [lat, lng]
}

// Create layers for polygon features
const polygonCentroidsLayer = L.featureGroup().addTo(map);
const polygonsLayer = L.featureGroup(); // Hidden by default, shown on centroid click

// Store polygon references by centroid marker ID
const polygonMap = {};
let currentVisiblePolygon = null;

// Load polygon features from GeoJSON
async function loadPolygons() {
    try {
        const response = await fetch('./merged_triangular_features.geojson');
        const geojsonData = await response.json();
        
        geojsonData.features.forEach((feature, idx) => {
            const props = feature.properties;
            const polygonCoords = feature.geometry.coordinates[0]; // Get first ring (exterior)
            const centroid = getPolygonCentroid(feature.geometry.coordinates);
            
            // Create centroid circle marker
            const marker = L.circleMarker(centroid, {
                radius: 6,
                fillColor: '#1976d2',
                color: '#1976d2',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            });
            const markerId = `polygon-${idx}`;
            marker.markerId = markerId;
            
            // Build popup content for the centroid marker
            let popupContent = `<h3>${props.primary_name}</h3>`;
            
            if (props.all_names && props.all_names.length > 0) {
                popupContent += `<p><strong>Names:</strong> ${props.all_names.join('; ')}</p>`;
            }
            if (props.descriptions && props.descriptions.length > 0) {
                popupContent += `<p><strong>Description:</strong> ${props.descriptions.join(' ')}</p>`;
            }
            if (props.folklore && props.folklore.length > 0) {
                popupContent += `<div style="margin-top: 8px;"><strong>Folklore:</strong><ul style="margin: 5px 0; padding-left: 20px;">`;
                props.folklore.forEach(f => {
                    popupContent += `<li style="margin: 3px 0;">${f}</li>`;
                });
                popupContent += `</ul></div>`;
            }
            if (props.historical_notes && props.historical_notes.length > 0) {
                popupContent += `<div style="margin-top: 8px;"><strong>Historical Notes:</strong><ul style="margin: 5px 0; padding-left: 20px;">`;
                props.historical_notes.forEach(n => {
                    popupContent += `<li style="margin: 3px 0;">${n}</li>`;
                });
                popupContent += `</ul></div>`;
            }
            if (props.links && props.links.length > 0) {
                popupContent += '<div style="margin-top: 8px;"><strong>References:</strong><ul style="margin: 5px 0; padding-left: 20px;">';
                props.links.forEach((link, idx) => {
                    popupContent += `<li style="margin: 3px 0;"><a href="${link}" target="_blank" style="color: #8b8680; text-decoration: underline;">Link ${idx + 1}</a></li>`;
                });
                popupContent += '</ul></div>';
            }
            
            marker.bindPopup(popupContent);
            marker.on('click', function(e) {
                this.openPopup();
                // Show the polygon when centroid is clicked
                const polygon = polygonMap[markerId];
                if (polygon) {
                    // Hide previous polygon if any
                    if (currentVisiblePolygon && currentVisiblePolygon !== polygon) {
                        map.removeLayer(currentVisiblePolygon);
                    }
                    // Show this polygon
                    if (!map.hasLayer(polygon)) {
                        polygon.addTo(map);
                    }
                    currentVisiblePolygon = polygon;
                }
                L.DomEvent.stopPropagation(e);
            });
            
            // Hide polygon when popup closes
            marker.on('popupclose', function() {
                const polygon = polygonMap[markerId];
                if (polygon && map.hasLayer(polygon)) {
                    map.removeLayer(polygon);
                    currentVisiblePolygon = null;
                }
            });
            
            polygonCentroidsLayer.addLayer(marker);
            
            // Create polygon layer (hidden by default)
            const polygonLayer = L.polygon([], {
                color: '#1976d2',
                weight: 2,
                opacity: 1,
                fillColor: '#1976d2',
                fillOpacity: 0.3
            });
            
            // Convert GeoJSON coordinates to Leaflet format (swap from [lng,lat] to [lat,lng])
            const leafletCoords = polygonCoords.map(point => [point[1], point[0]]);
            polygonLayer.setLatLngs([leafletCoords]);
            
            // Build popup for the polygon
            let polygonPopupContent = `<h3>${props.primary_name}</h3>`;
            if (props.all_names && props.all_names.length > 0) {
                polygonPopupContent += `<p><strong>Names:</strong> ${props.all_names.join('; ')}</p>`;
            }
            
            polygonLayer.bindPopup(polygonPopupContent);
            
            // Store polygon reference
            polygonMap[markerId] = polygonLayer;
        });
        
        console.log(`Loaded ${geojsonData.features.length} polygon features`);
    } catch (error) {
        console.error('Error loading polygon features:', error);
    }
}

// Function to hide a polygon
function hidePolygon(markerId) {
    const polygon = polygonMap[markerId];
    if (polygon && map.hasLayer(polygon)) {
        map.removeLayer(polygon);
        currentVisiblePolygon = null;
    }
}

// Create layer for v5 combined features
const v5Layer = L.featureGroup();

// Load v5 combined features from GeoJSON
async function loadV5() {
    try {
        const response = await fetch('./v5.geojson');
        const geojsonData = await response.json();
        
        geojsonData.features.forEach(feature => {
            const props = feature.properties;
            const geomType = feature.geometry.type;
            
            if (geomType === 'Point') {
                // Handle point features
                const coords = feature.geometry.coordinates;
                const marker = L.circleMarker([coords[1], coords[0]], {
                    radius: 6,
                    fillColor: '#9c27b0',
                    color: '#9c27b0',
                    weight: 2,
                    opacity: 1,
                    fillOpacity: 0.8
                });
                let popupContent = `<h3>${props.name}</h3>`;
                
                if (props.related_artefacts) {
                    const artefacts = Array.isArray(props.related_artefacts) ? props.related_artefacts : [props.related_artefacts];
                    if (artefacts.length > 0) {
                        popupContent += '<div style="margin-top: 8px;"><strong>Artefacts:</strong><ul style="margin: 5px 0; padding-left: 20px;">';
                        artefacts.forEach((art, idx) => {
                            if (typeof art === 'string' && art.startsWith('http')) {
                                popupContent += `<li style="margin: 3px 0;"><a href="${art}" target="_blank">Link ${idx + 1} →</a></li>`;
                            } else {
                                popupContent += `<li style="margin: 3px 0;">${art}</li>`;
                            }
                        });
                        popupContent += '</ul></div>';
                    }
                }
                
                marker.bindPopup(popupContent);
                marker.on('click', function() { this.openPopup(); });
                v5Layer.addLayer(marker);
                
            } else if (geomType === 'Polygon') {
                // Handle polygon features
                const polygonCoords = feature.geometry.coordinates[0];
                const leafletCoords = polygonCoords.map(point => [point[1], point[0]]);
                
                const polygon = L.polygon(leafletCoords, {
                    color: '#9c27b0',
                    weight: 2,
                    opacity: 1,
                    fillColor: '#9c27b0',
                    fillOpacity: 0.3
                });
                
                let popupContent = `<h3>${props.name}</h3>`;
                
                if (props.related_artefacts) {
                    const artefacts = Array.isArray(props.related_artefacts) ? props.related_artefacts : [props.related_artefacts];
                    if (artefacts.length > 0) {
                        popupContent += '<div style="margin-top: 8px;"><strong>Artefacts:</strong><ul style="margin: 5px 0; padding-left: 20px;">';
                        artefacts.forEach((art, idx) => {
                            if (typeof art === 'string' && art.startsWith('http')) {
                                popupContent += `<li style="margin: 3px 0;"><a href="${art}" target="_blank">Link ${idx + 1} →</a></li>`;
                            } else {
                                popupContent += `<li style="margin: 3px 0;">${art}</li>`;
                            }
                        });
                        popupContent += '</ul></div>';
                    }
                }
                
                polygon.bindPopup(popupContent);
                polygon.on('click', function() { this.openPopup(); });
                v5Layer.addLayer(polygon);
            }
        });
        
        console.log(`Loaded ${geojsonData.features.length} v5 features`);
    } catch (error) {
        console.error('Error loading v5 features:', error);
    }
}

// Load on startup
loadPolygons();

// Load v5 on startup
loadV5();

// Toggle polygon centroids layer
document.getElementById('togglePolygons').addEventListener('change', function(e) {
    if (e.target.checked) {
        polygonCentroidsLayer.addTo(map);
    } else {
        map.removeLayer(polygonCentroidsLayer);
        // Also remove any visible polygons
        map.removeLayer(polygonsLayer);
    }
});

// Toggle v5 layer
document.getElementById('toggleV5').addEventListener('change', function(e) {
    if (e.target.checked) {
        v5Layer.addTo(map);
    } else {
        map.removeLayer(v5Layer);
    }
});

// Toggle legend modal
const legendModal = document.getElementById('legendModal');
const legendCheckbox = document.getElementById('toggleLegend');
const closeLegendBtn = document.getElementById('closeLegend');

legendCheckbox.addEventListener('change', function(e) {
    if (e.target.checked) {
        legendModal.style.display = 'flex';
    } else {
        legendModal.style.display = 'none';
    }
});

closeLegendBtn.addEventListener('click', function() {
    legendCheckbox.checked = false;
    legendModal.style.display = 'none';
});

// Close legend when clicking outside the image
legendModal.addEventListener('click', function(e) {
    if (e.target === legendModal) {
        legendCheckbox.checked = false;
        legendModal.style.display = 'none';
    }
});

// Keyboard shortcuts
document.addEventListener('keydown', function(e) {
    if (e.key === '+' || e.key === '=') map.zoomIn();
    else if (e.key === '-') map.zoomOut();
});

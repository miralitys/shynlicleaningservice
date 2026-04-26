"use strict";

function createStaffRuntimeScripts(deps = {}) {
  const { GOOGLE_PLACES_API_KEY } = deps;

  function renderStaffAddressAutocompleteScript() {
    if (!GOOGLE_PLACES_API_KEY) return "";

    return `<script>
      (() => {
        const adminPlacesApiKey = ${JSON.stringify(GOOGLE_PLACES_API_KEY)};
        if (!adminPlacesApiKey) return;

        function escapeSuggestionHtml(value) {
          return String(value || "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;");
        }

        function createPlacesApi() {
          const placesNamespace = window.google && window.google.maps && window.google.maps.places;
          if (!placesNamespace) return null;
          const host = document.createElement("div");
          host.hidden = true;
          document.body.appendChild(host);
          return {
            autocompleteService: new placesNamespace.AutocompleteService(),
            placesService: new placesNamespace.PlacesService(host),
            placesStatus: placesNamespace.PlacesServiceStatus,
            sessionTokenCtor: placesNamespace.AutocompleteSessionToken,
          };
        }

        function loadPlacesApi() {
          if (window.__adminPlacesApiPromise) return window.__adminPlacesApiPromise;
          if (window.google && window.google.maps && window.google.maps.places) {
            window.__adminPlacesApiPromise = Promise.resolve(createPlacesApi());
            return window.__adminPlacesApiPromise;
          }

          window.__adminPlacesApiPromise = new Promise((resolve, reject) => {
            window.__adminGooglePlacesReady = () => resolve(createPlacesApi());

            const existingScript = document.querySelector('script[data-admin-google-places="true"]');
            if (existingScript) return;

            const script = document.createElement("script");
            script.async = true;
            script.defer = true;
            script.setAttribute("data-admin-google-places", "true");
            script.src = "https://maps.googleapis.com/maps/api/js?key=" + encodeURIComponent(adminPlacesApiKey) + "&libraries=places&loading=async&v=beta&callback=__adminGooglePlacesReady";
            script.onerror = () => reject(new Error("Failed to load Google Places"));
            document.head.appendChild(script);
          }).catch(() => null);

          return window.__adminPlacesApiPromise;
        }

        function bindAutocomplete(input, placesApi) {
          if (!input || input.dataset.adminAddressBound === "true") return;
          const field = input.closest("[data-admin-address-field]");
          const suggestions = field ? field.querySelector("[data-admin-address-suggestions]") : null;
          if (!field || !suggestions) return;

          input.dataset.adminAddressBound = "true";

          const autocompleteService = placesApi.autocompleteService;
          const placesService = placesApi.placesService;
          const placesStatus = placesApi.placesStatus;
          const SessionToken = placesApi.sessionTokenCtor;
          const country = input.getAttribute("data-admin-address-country") || "us";
          let currentPredictions = [];
          let pendingRequestId = 0;
          let inputTimer = null;
          let blurTimer = null;
          let sessionToken = typeof SessionToken === "function" ? new SessionToken() : null;

          function resetSessionToken() {
            sessionToken = typeof SessionToken === "function" ? new SessionToken() : null;
          }

          function closeSuggestions() {
            currentPredictions = [];
            suggestions.hidden = true;
            suggestions.innerHTML = "";
            input.setAttribute("aria-expanded", "false");
          }

          function openSuggestions() {
            if (!suggestions.innerHTML.trim()) return;
            suggestions.hidden = false;
            input.setAttribute("aria-expanded", "true");
          }

          function applySelectedAddress(value) {
            input.value = value || "";
            closeSuggestions();
            resetSessionToken();
            input.dispatchEvent(new Event("input", { bubbles: true }));
            input.dispatchEvent(new Event("change", { bubbles: true }));
          }

          function renderPredictions(predictions) {
            currentPredictions = predictions.slice(0, 6);
            suggestions.innerHTML = currentPredictions
              .map((prediction, index) => {
                const formatting = prediction.structured_formatting || {};
                const mainText = formatting.main_text || prediction.description || "";
                const secondaryText = formatting.secondary_text || "";
                return '<button class="admin-address-suggestion" type="button" role="option" data-admin-address-option="' + index + '">' +
                  '<span class="admin-address-suggestion-main">' + escapeSuggestionHtml(mainText) + '</span>' +
                  (secondaryText
                    ? '<span class="admin-address-suggestion-copy">' + escapeSuggestionHtml(secondaryText) + '</span>'
                    : "") +
                '</button>';
              })
              .join("");
            openSuggestions();
          }

          function requestPredictions(query) {
            const trimmed = String(query || "").trim();
            if (trimmed.length < 3) {
              closeSuggestions();
              return;
            }

            const requestId = ++pendingRequestId;
            const request = {
              input: trimmed,
              componentRestrictions: { country },
              types: ["address"],
            };
            if (sessionToken) {
              request.sessionToken = sessionToken;
            }

            autocompleteService.getPlacePredictions(request, (predictions, status) => {
              if (requestId !== pendingRequestId) return;
              if (
                status !== placesStatus.OK ||
                !Array.isArray(predictions) ||
                predictions.length === 0
              ) {
                closeSuggestions();
                return;
              }
              renderPredictions(predictions);
            });
          }

          input.addEventListener("input", () => {
            if (blurTimer) {
              window.clearTimeout(blurTimer);
              blurTimer = null;
            }
            window.clearTimeout(inputTimer);
            inputTimer = window.setTimeout(() => requestPredictions(input.value), 120);
          });

          input.addEventListener("focus", () => {
            if (suggestions.innerHTML.trim()) {
              openSuggestions();
            } else if (input.value.trim().length >= 3) {
              requestPredictions(input.value);
            }
          });

          input.addEventListener("blur", () => {
            blurTimer = window.setTimeout(closeSuggestions, 140);
          });

          suggestions.addEventListener("mousedown", (event) => {
            const option = event.target.closest("[data-admin-address-option]");
            if (!option) return;
            event.preventDefault();
            const index = Number(option.getAttribute("data-admin-address-option"));
            const prediction = currentPredictions[index];
            if (!prediction) return;

            const fallbackAddress = prediction.description || "";
            if (!prediction.place_id) {
              applySelectedAddress(fallbackAddress);
              return;
            }

            const detailsRequest = {
              placeId: prediction.place_id,
              fields: ["formatted_address"],
            };
            if (sessionToken) {
              detailsRequest.sessionToken = sessionToken;
            }

            placesService.getDetails(detailsRequest, (place, status) => {
              const formattedAddress =
                status === placesStatus.OK && place && place.formatted_address
                  ? place.formatted_address
                  : fallbackAddress;
              applySelectedAddress(formattedAddress);
            });
          });

          document.addEventListener("click", (event) => {
            if (!field.contains(event.target)) {
              closeSuggestions();
            }
          });
        }

        function bindAddressInputs(scope = document) {
          const targetScope = scope && typeof scope.querySelectorAll === "function" ? scope : document;
          loadPlacesApi().then((placesApi) => {
            if (!placesApi) return;
            targetScope.querySelectorAll('[data-admin-address-autocomplete="true"]').forEach((input) => bindAutocomplete(input, placesApi));
          });
        }

        window.__adminLoadMapsApi = loadPlacesApi;
        window.__adminBindAddressAutocomplete = bindAddressInputs;
        bindAddressInputs(document);
      })();
    </script>`;
  }

  function renderStaffTravelEstimateScript() {
    return "";
  }

  function renderStaffTeamCalendarDragScript() {
    return `<script>
      (() => {
        const calendarWraps = Array.from(document.querySelectorAll('[data-admin-team-calendar-scroll="true"]'));
        if (!calendarWraps.length) return;

        const getDialogTrigger = (target) =>
          target && target.closest ? target.closest('[data-admin-dialog-open]') : null;

        const isBlockedInteractiveTarget = (target) =>
          Boolean(
            target &&
            target.closest &&
            target.closest('input, select, textarea, summary, label, [data-admin-dialog-close]')
          );

        calendarWraps.forEach((wrap) => {
          let pointerId = null;
          let startX = 0;
          let startScrollLeft = 0;
          let suppressClick = false;
          let hasCenteredAnchor = false;
          let pendingDialogTrigger = null;

          const scrollToCell = (cell, behavior = 'auto') => {
            if (!cell) return;
            const targetScrollLeft = Math.max(
              0,
              cell.offsetLeft - (wrap.clientWidth / 2) + (cell.clientWidth / 2)
            );
            wrap.scrollTo({ left: targetScrollLeft, behavior });
          };

          const centerAnchorCell = () => {
            if (hasCenteredAnchor) return;
            const anchor = wrap.querySelector('[data-admin-team-calendar-anchor="true"]');
            if (!anchor) return;
            hasCenteredAnchor = true;
            scrollToCell(anchor);
          };

          const scrollToTodayCell = () => {
            const todayCell = wrap.querySelector('[data-admin-team-calendar-today="true"]');
            if (todayCell) {
              scrollToCell(todayCell, 'smooth');
              return;
            }
            const anchor = wrap.querySelector('[data-admin-team-calendar-anchor="true"]');
            scrollToCell(anchor, 'smooth');
          };

          const stopDragging = () => {
            pointerId = null;
            pendingDialogTrigger = null;
            wrap.classList.remove('admin-team-calendar-wrap-dragging');
            window.setTimeout(() => {
              suppressClick = false;
            }, 0);
          };

          wrap.addEventListener('pointerdown', (event) => {
            if (event.pointerType === 'mouse' && event.button !== 0) return;
            if (isBlockedInteractiveTarget(event.target)) return;

            pendingDialogTrigger = getDialogTrigger(event.target);
            pointerId = event.pointerId;
            startX = event.clientX;
            startScrollLeft = wrap.scrollLeft;
            suppressClick = false;
            wrap.classList.add('admin-team-calendar-wrap-dragging');

            if (pendingDialogTrigger) {
              event.preventDefault();
            }

            if (typeof wrap.setPointerCapture === 'function') {
              wrap.setPointerCapture(event.pointerId);
            }
          });

          wrap.addEventListener('pointermove', (event) => {
            if (pointerId === null || event.pointerId !== pointerId) return;

            const deltaX = event.clientX - startX;
            if (Math.abs(deltaX) > 4) {
              suppressClick = true;
            }
            wrap.scrollLeft = startScrollLeft - deltaX;
            if (suppressClick) {
              event.preventDefault();
            }
          });

          wrap.addEventListener('pointerup', (event) => {
            if (pointerId === null || event.pointerId !== pointerId) return;
            const dialogTrigger = !suppressClick && pendingDialogTrigger ? pendingDialogTrigger : null;
            stopDragging();
            if (dialogTrigger && typeof dialogTrigger.click === 'function') {
              window.requestAnimationFrame(() => {
                dialogTrigger.click();
              });
            }
          });
          wrap.addEventListener('pointercancel', stopDragging);
          wrap.addEventListener('lostpointercapture', stopDragging);

          wrap.addEventListener(
            'click',
            (event) => {
              if (!suppressClick) return;
              event.preventDefault();
              event.stopPropagation();
            },
            true
          );

          if (document.readyState === 'complete') {
            centerAnchorCell();
          } else {
            window.addEventListener('load', centerAnchorCell, { once: true });
          }
          window.requestAnimationFrame(centerAnchorCell);

          const shell = wrap.closest('.admin-team-calendar-shell');
          const todayButton = shell
            ? shell.querySelector('[data-admin-team-calendar-scroll-today="true"]')
            : null;
          if (todayButton) {
            todayButton.addEventListener('click', (event) => {
              event.preventDefault();
              scrollToTodayCell();
            });
          }
        });
      })();
    </script>`;
  }

  return {
    renderStaffAddressAutocompleteScript,
    renderStaffTravelEstimateScript,
    renderStaffTeamCalendarDragScript,
  };
}

module.exports = {
  createStaffRuntimeScripts,
};

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
        const getDialogTrigger = (target) =>
          target && target.closest ? target.closest('[data-admin-dialog-open]') : null;

        const isBlockedInteractiveTarget = (target) =>
          Boolean(
            target &&
            target.closest &&
            target.closest('input, select, textarea, summary, label, [data-admin-dialog-close]')
          );

        const isCalendarFullscreen = (shell) =>
          Boolean(
            shell &&
            (
              document.fullscreenElement === shell ||
              shell.classList.contains('admin-team-calendar-shell-fullscreen')
            )
          );

        const setBodyLock = (shell) => {
          document.body.classList.toggle(
            'admin-team-calendar-body-lock',
            Boolean(shell && shell.classList.contains('admin-team-calendar-shell-fullscreen'))
          );
        };

        const syncFullscreenButton = (shell) => {
          if (!shell) return;
          const fullscreenButton = shell.querySelector('[data-admin-team-calendar-fullscreen-button="true"]');
          if (!fullscreenButton) return;
          const isFullscreen = isCalendarFullscreen(shell);
          fullscreenButton.setAttribute('aria-pressed', isFullscreen ? 'true' : 'false');
          fullscreenButton.textContent = isFullscreen ? 'Закрыть экран' : 'На весь экран';
        };

        const syncLowLoadState = (shell, checked) => {
          if (!shell) return;
          const isChecked = Boolean(checked);
          const lowLoadToggle = shell.querySelector('[data-admin-team-calendar-low-load-toggle="true"]');
          if (lowLoadToggle) {
            lowLoadToggle.checked = isChecked;
          }
          shell.classList.toggle('admin-team-calendar-show-low-load', isChecked);
        };

        const scrollToCell = (wrap, cell, behavior = 'auto') => {
          if (!wrap || !cell) return;
          const targetScrollLeft = Math.max(
            0,
            cell.offsetLeft - (wrap.clientWidth / 2) + (cell.clientWidth / 2)
          );
          const targetScrollTop = Math.max(
            0,
            cell.offsetTop - (wrap.clientHeight / 2) + (cell.clientHeight / 2)
          );
          wrap.scrollTo({ left: targetScrollLeft, top: targetScrollTop, behavior });
        };

        const centerAnchorCell = (wrap) => {
          if (!wrap) return;
          const anchor = wrap.querySelector('[data-admin-team-calendar-anchor="true"]');
          if (!anchor) return;
          scrollToCell(wrap, anchor);
        };

        const bindCalendarWrap = (shell) => {
          const wrap = shell ? shell.querySelector('[data-admin-team-calendar-scroll="true"]') : null;
          if (!wrap || wrap.dataset.adminTeamCalendarDragBound === 'true') return;
          wrap.dataset.adminTeamCalendarDragBound = 'true';

          let pointerId = null;
          let startX = 0;
          let startScrollLeft = 0;
          let suppressClick = false;
          let pendingDialogTrigger = null;

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
            centerAnchorCell(wrap);
          } else {
            window.addEventListener('load', () => centerAnchorCell(wrap), { once: true });
          }
          window.requestAnimationFrame(() => centerAnchorCell(wrap));
        };

        const refreshCalendarShell = async (shell, url, options = {}) => {
          if (!shell || !url) return false;

          const lowLoadWasChecked = Boolean(
            shell.querySelector('[data-admin-team-calendar-low-load-toggle="true"]')?.checked
          );
          shell.classList.add('admin-team-calendar-shell-loading');

          try {
            const response = await fetch(url, {
              credentials: 'same-origin',
              headers: {
                'x-requested-with': 'fetch',
                'x-shynli-admin-ajax': '1',
              },
            });
            const html = await response.text();
            const doc = new DOMParser().parseFromString(html, 'text/html');
            const nextShell = doc.querySelector('[data-admin-team-calendar-shell="true"]');
            if (!response.ok || !nextShell) {
              throw new Error('Calendar shell was not found in the response.');
            }

            shell.innerHTML = nextShell.innerHTML;
            syncLowLoadState(shell, lowLoadWasChecked);
            bindCalendarShell(shell);
            bindCalendarWrap(shell);
            syncFullscreenButton(shell);

            if (options.pushState !== false) {
              window.history.pushState({ adminTeamCalendar: true }, '', url);
            }
            return true;
          } finally {
            shell.classList.remove('admin-team-calendar-shell-loading');
          }
        };

        const bindCalendarShell = (shell) => {
          if (!shell) return;
          bindCalendarWrap(shell);
          syncFullscreenButton(shell);

          if (shell.dataset.adminTeamCalendarShellBound === 'true') return;
          shell.dataset.adminTeamCalendarShellBound = 'true';

          shell.addEventListener('click', async (event) => {
            const target = event.target;
            const navigationLink = target && target.closest
              ? target.closest('[data-admin-team-calendar-nav="true"]')
              : null;
            if (navigationLink) {
              if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
              event.preventDefault();
              try {
                await refreshCalendarShell(shell, navigationLink.href);
              } catch (error) {
                window.location.href = navigationLink.href;
              }
              return;
            }

            const fullscreenButton = target && target.closest
              ? target.closest('[data-admin-team-calendar-fullscreen-button="true"]')
              : null;
            if (fullscreenButton) {
              event.preventDefault();
              const canUseNativeFullscreen =
                typeof shell.requestFullscreen === 'function' &&
                typeof document.exitFullscreen === 'function';
              try {
                if (canUseNativeFullscreen) {
                  if (document.fullscreenElement === shell) {
                    await document.exitFullscreen();
                  } else {
                    await shell.requestFullscreen();
                  }
                } else {
                  shell.classList.toggle('admin-team-calendar-shell-fullscreen');
                  document.body.classList.toggle(
                    'admin-team-calendar-body-lock',
                    shell.classList.contains('admin-team-calendar-shell-fullscreen')
                  );
                }
              } catch (error) {
                shell.classList.toggle('admin-team-calendar-shell-fullscreen');
                document.body.classList.toggle(
                  'admin-team-calendar-body-lock',
                  shell.classList.contains('admin-team-calendar-shell-fullscreen')
                );
              }
              syncFullscreenButton(shell);
              setBodyLock(shell);
            }
          });

          shell.addEventListener('change', (event) => {
            const target = event.target;
            if (!target || !target.matches || !target.matches('[data-admin-team-calendar-low-load-toggle="true"]')) {
              return;
            }
            syncLowLoadState(shell, target.checked);
          });

          document.addEventListener('fullscreenchange', () => {
            syncFullscreenButton(shell);
            setBodyLock(shell);
          });
        };

        document.querySelectorAll('[data-admin-team-calendar-shell="true"]').forEach(bindCalendarShell);

        window.addEventListener('popstate', () => {
          const shell = document.querySelector('[data-admin-team-calendar-shell="true"]');
          if (!shell) return;
          refreshCalendarShell(shell, window.location.href, { pushState: false }).catch(() => {
            window.location.reload();
          });
        });

        document.addEventListener('DOMContentLoaded', () => {
          document.querySelectorAll('[data-admin-team-calendar-shell="true"]').forEach(bindCalendarShell);
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

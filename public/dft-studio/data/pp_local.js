/* Local POTCAR library switch.
 * Public deployments keep this false: POTCAR files are licensed by VASP Software GmbH and are never shipped.
 * A lab-internal copy that holds its own licensed library in data/potcars/<FUNCTIONAL>/<variant>.js
 * (never committed to git) can set this to true; the POTCAR and Run bundle steps can then include a real POTCAR.
 */
window.PP_LOCAL_LIBRARY = true;

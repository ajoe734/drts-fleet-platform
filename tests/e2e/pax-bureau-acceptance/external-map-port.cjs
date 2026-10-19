// Hosted-only replacement of the external Google HTTP port. The original
// GeoService, authorization, service-area, fare, booking and PG remain real.
if (process.env.GITHUB_ACTIONS !== "true")
  throw new Error("Bureau external-map simulation is GitHub-hosted only");
const originalFetch = globalThis.fetch;
const places = [
  {
    id: "bureau-banqiao",
    address: "新北市板橋區合成板橋車站",
    lat: 25.0142,
    lng: 121.4636,
  },
  {
    id: "bureau-city-hall",
    address: "新北市板橋區合成市政府",
    lat: 25.012,
    lng: 121.4654,
  },
];
const result = (place) => ({
  formatted_address: place.address,
  place_id: place.id,
  geometry: {
    location: { lat: place.lat, lng: place.lng },
    location_type: "ROOFTOP",
  },
  address_components: [
    {
      long_name: "新北市",
      short_name: "新北市",
      types: ["administrative_area_level_1"],
    },
  ],
  types: ["street_address"],
});
globalThis.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input));
  if (url.origin === "https://routes.googleapis.com")
    return Response.json({
      routes: [
        {
          distanceMeters: 230,
          duration: "108s",
          polyline: { encodedPolyline: "" },
        },
      ],
    });
  if (url.origin !== "https://maps.googleapis.com")
    return originalFetch(input, init);
  const query = url.searchParams.get("address") || "";
  if (query === "交通局圖資斷線")
    throw new TypeError("Synthetic external map disconnect");
  if (query === "交通局圖資逾時")
    return new Promise((_, reject) => {
      const signal = init?.signal;
      if (signal?.aborted) reject(signal.reason);
      else
        signal?.addEventListener("abort", () => reject(signal.reason), {
          once: true,
        });
    });
  if (query === "交通局零候選")
    return Response.json({ status: "ZERO_RESULTS", results: [] });
  let selected;
  const id = url.searchParams.get("place_id");
  if (id) selected = places.filter((place) => place.id === id);
  else if (url.searchParams.has("latlng")) selected = [places[0]];
  else if (query === "交通局同名地址")
    selected = places.map((place) => ({
      ...place,
      address: "新北市板橋區合成同名地址",
    }));
  else if (query.includes("板橋車站")) selected = [places[0]];
  else if (query.includes("市政府")) selected = [places[1]];
  else throw new Error("Unrecognized synthetic external map query");
  return Response.json({
    status: selected.length ? "OK" : "ZERO_RESULTS",
    results: selected.map(result),
  });
};

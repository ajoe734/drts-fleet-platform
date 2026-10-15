/** Illustrative New Taipei meeting points, not geocoder/navigation results.
 * Shared by the passenger selector and the external driver position producer.
 */
export const PAX_REVIEW_STOPS = [
  {
    addressId: "review-banqiao",
    address: "新北・板橋車站演練點（模擬選址）",
    lat: 25.0142,
    lng: 121.4636,
  },
  {
    addressId: "review-city-hall",
    address: "新北市政府演練點（模擬選址）",
    lat: 25.012,
    lng: 121.4654,
  },
] as const;

export const PAX_REVIEW_TRACK = Array.from({ length: 9 }, (_, index) => ({
  lat:
    PAX_REVIEW_STOPS[0].lat +
    ((PAX_REVIEW_STOPS[1].lat - PAX_REVIEW_STOPS[0].lat) * index) / 8,
  lng:
    PAX_REVIEW_STOPS[0].lng +
    ((PAX_REVIEW_STOPS[1].lng - PAX_REVIEW_STOPS[0].lng) * index) / 8,
}));

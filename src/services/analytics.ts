export function track(
  event: string,
  payload?: unknown
) {
  console.log(
    "[Analytics]",
    event,
    payload
  );
}
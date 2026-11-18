const originalFlights=['0251','0250','0249','0248','0247','0246','0245','0061','0291','0292','0293','0294','0297','0298'];

// A subsequent adjustment in the editor takes precedence over this registration.
function photoPose(camera, registration) {
  if (!registration) return camera;
  const baseline = registration.original;
  const point = camera.point;
  if (!Array.isArray(point) || point.length !== 2 ||
      !point.every((value, i) => Math.abs(value - baseline.point[i]) < 1e-7)) return camera;
  const matches = ['height', 'heading', 'tilt', 'roll'].every(key =>
    Math.abs((camera[key] ?? 0) - baseline[key]) < 0.001);
  return matches ? {...camera, ...registration.calibrada} : camera;
}

export function composeTerrazasTour(saved, additions, details, registrations = {}, colorPhotos = {}){
  if (!Array.isArray(saved)) return saved;
  const photosByHash = new Map(Object.values(colorPhotos).map(photo => [photo.hashOriginal,photo]));
  // A project recreated under this slug only gets these assets if its saved
  // tour includes a known station or an original panorama with the same hash.
  if (!saved.some(camera => Object.hasOwn(colorPhotos,camera.id) || photosByHash.has(camera.hash))) return saved;
  const existing = new Set(saved.map(camera => camera.id));
  const cameras=[];
  for(const [index,camera] of saved.entries()){
    const file=[camera.filename,camera.name,camera.url].join(' ');
    const flight=file.match(/_(\d{4})_D_M4/i)?.[1] ||
      (saved.length===originalFlights.length ? originalFlights[index] : undefined);
    const view = {...photoPose(camera, registrations[flight]), sourceFlight:flight};
    const photo = photosByHash.get(camera.hash);
    if (photo && camera.hash) {
      view.url = photo.url;
      view.alta = photo.alta;
      view.miniatura = photo.miniatura;
    }
    cameras.push(view);
    cameras.push(...additions.filter(view=>view.after && view.after===flight && !existing.has(view.id)));
  }
  return [...cameras,...details.filter(view=>!existing.has(view.id))];
}

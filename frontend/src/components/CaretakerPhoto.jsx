import { useEffect, useState } from 'react';
import { getToken } from '../api.js';

export default function CaretakerPhoto({ documentId, name }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let alive = true; let objectUrl = '';
    if (!documentId) { setSrc(''); return undefined; }
    fetch(`/api/caretakers/documents/${documentId}/file`, { headers: { Authorization: 'Bearer ' + getToken() } })
      .then((r) => r.ok ? r.blob() : null)
      .then((blob) => { if (alive && blob) { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); } })
      .catch(() => {});
    return () => { alive = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [documentId]);
  return src ? <img className="caretaker-photo" src={src} alt={`${name || 'Caretaker'} passport photo`} /> : <span className="caretaker-photo placeholder">{(name || 'C').slice(0, 1).toUpperCase()}</span>;
}

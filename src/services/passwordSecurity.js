// Validacion de contrasenas usando la API publica de HaveIBeenPwned
// con k-anonymity (no se envia la contrasena ni su hash completo).
// Documentacion: https://haveibeenpwned.com/API/v3#PwnedPasswords
//
// Uso:
//   await asegurarPasswordSegura(password);
//   - Lanza Error si la contrasena no cumple longitud minima.
//   - Lanza Error si HIBP la marca como filtrada.
//   - Si HIBP no esta disponible (offline / fetch falla), no bloquea el alta.

const LONGITUD_MINIMA = 10;

async function sha1Hex(texto) {
  const codificador = new TextEncoder();
  const datos = codificador.encode(texto);
  const buffer = await crypto.subtle.digest('SHA-1', datos);
  const bytes = Array.from(new Uint8Array(buffer));
  return bytes.map((b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function validarFortalezaBasica(password) {
  if (typeof password !== 'string' || password.length < LONGITUD_MINIMA) {
    throw new Error(`La contrasena debe tener al menos ${LONGITUD_MINIMA} caracteres.`);
  }

  const tieneMinuscula = /[a-z]/.test(password);
  const tieneMayuscula = /[A-Z]/.test(password);
  const tieneDigito = /\d/.test(password);

  if (!tieneMinuscula || !tieneMayuscula || !tieneDigito) {
    throw new Error('La contrasena debe incluir mayusculas, minusculas y numeros.');
  }
}

async function consultarHIBP(prefijo) {
  // Pasamos un timeout corto para no colgar la UI si HIBP esta caido.
  const controlador = new AbortController();
  const timeout = setTimeout(() => controlador.abort(), 4000);

  try {
    const respuesta = await fetch(`https://api.pwnedpasswords.com/range/${prefijo}`, {
      method: 'GET',
      headers: { 'Add-Padding': 'true' },
      signal: controlador.signal,
    });

    if (!respuesta.ok) {
      return null;
    }

    return await respuesta.text();
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function asegurarPasswordSegura(password) {
  validarFortalezaBasica(password);

  let hash;
  try {
    hash = await sha1Hex(password);
  } catch {
    // Sin Web Crypto disponible no podemos comprobar HIBP; aceptamos.
    return;
  }

  const prefijo = hash.slice(0, 5);
  const sufijo = hash.slice(5);

  const cuerpo = await consultarHIBP(prefijo);
  if (!cuerpo) {
    // HIBP no disponible: no bloqueamos. La fortaleza basica ya se valido.
    return;
  }

  const lineas = cuerpo.split('\n');
  for (const linea of lineas) {
    const [sufijoListado, contadorRaw] = linea.trim().split(':');
    if (!sufijoListado) {
      continue;
    }
    if (sufijoListado.toUpperCase() === sufijo) {
      const contador = Number.parseInt(contadorRaw, 10) || 0;
      if (contador > 0) {
        throw new Error(
          'Esta contrasena aparece en filtraciones publicas conocidas. Elige otra.',
        );
      }
    }
  }
}

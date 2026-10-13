// Reglas de la conexión de una cuenta de Mercado Pago, con dependencias
// inyectadas (DB, cifrado, refresh) para poder testearlas sin red ni Supabase.

const SIETE_DIAS = 7 * 86400_000

// Token listo para usar, renovando el OAuth si vence en < 7 días. MP rota el
// refresh token en cada uso, así que dos syncs a la vez (cron + app abierta)
// compiten: el que pierde recibe invalid_grant. En ese caso se relee la cuenta y,
// si otro proceso ya la rotó, se usa su token (nunca se pisan los tokens nuevos
// con los viejos). Solo si nadie la rotó se marca para reconectar.
export async function tokenVigente({ cuenta, db, cripto, refrescar, ahora = Date.now() }) {
  const actual = cripto.descifrar(cuenta.access_token_enc)
  const vence = cuenta.expira_at ? Date.parse(cuenta.expira_at) : null
  if (cuenta.metodo !== 'oauth' || !vence || vence - ahora >= SIETE_DIAS) return actual
  try {
    const t = await refrescar(cripto.descifrar(cuenta.refresh_token_enc))
    await db.guardarTokens(
      cuenta.owner,
      {
        access_token_enc: cripto.cifrar(t.access_token),
        refresh_token_enc: cripto.cifrar(t.refresh_token),
        expira_at: new Date(ahora + Number(t.expires_in) * 1000).toISOString(),
        necesita_reconectar: false,
      },
      cuenta.refresh_token_enc,
    )
    return t.access_token
  } catch (e) {
    const fila = await db.leerCuenta(cuenta.owner)
    if (fila && fila.refresh_token_enc !== cuenta.refresh_token_enc) return cripto.descifrar(fila.access_token_enc)
    await db.marcarReconectar(cuenta.owner)
    if (vence <= ahora) throw new Error('El acceso a Mercado Pago venció: reconectá la cuenta')
    console.warn('[mp] no se pudo renovar el token de', cuenta.owner, e.message)
    return actual
  }
}

// Una cuenta de MP pertenece a una sola persona de la app: si ya la conectó otra,
// se rechaza (si no, los movimientos pasarían de un dueño al otro en cada sync).
export async function asegurarCuentaLibre(db, mpUserId, owner) {
  const otra = await db.cuentaPorMpUser(mpUserId)
  if (otra && otra.owner !== owner) {
    throw Object.assign(new Error('Esa cuenta de Mercado Pago ya está conectada por otra persona'), { code: 'cuenta-ajena' })
  }
}

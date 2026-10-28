
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const paypalClientId = process.env.NEXT_PUBLIC_PAYPAL_CLIENT_ID
const paypalClientSecret = process.env.PAYPAL_CLIENT_SECRET

const paypalEnvironment =
  process.env.PAYPAL_ENVIRONMENT === 'live' ? 'live' : 'sandbox'

if (
  !supabaseUrl ||
  !supabaseServiceRoleKey ||
  !paypalClientId ||
  !paypalClientSecret
) {
  throw new Error('Supabase- oder PayPal-Umgebungsvariablen fehlen.')
}

const supabaseAdmin = createClient(
  supabaseUrl,
  supabaseServiceRoleKey,
  {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  },
)

const paypalBaseUrl =
  paypalEnvironment === 'live'
    ? 'https://api-m.paypal.com'
    : 'https://api-m.sandbox.paypal.com'

async function getPayPalAccessToken() {
  const credentials = Buffer.from(
    `${paypalClientId}:${paypalClientSecret}`,
  ).toString('base64')

  const response = await fetch(`${paypalBaseUrl}/v1/oauth2/token`, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  })

  if (!response.ok) {
    const errorText = await response.text()
    console.error('PayPal Access Token Fehler:', errorText)
    throw new Error('PayPal-Zugang konnte nicht hergestellt werden.')
  }

  const data = await response.json()
  return data.access_token as string
}

async function readPayPalResponse(response: Response): Promise<any> {
  const text = await response.text()

  if (!text) return {}

  try {
    return JSON.parse(text)
  } catch {
    return { message: text.slice(0, 500) }
  }
}

function isExpectedMoney(amount: any, expectedAmount: string) {
  if (
    !amount ||
    amount.currency_code !== 'EUR' ||
    typeof amount.value !== 'string'
  ) {
    return false
  }

  const value = Number(amount.value)

  return Number.isFinite(value) && value.toFixed(2) === expectedAmount
}

function errorResponse(error: string, status: number) {
  return NextResponse.json({ error }, { status })
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const token =
      typeof body?.token === 'string' ? body.token.trim() : ''

    const orderId =
      typeof body?.order_id === 'string' ? body.order_id.trim() : ''

    if (!token) {
      return errorResponse('Kein Team-Link angegeben.', 400)
    }

    if (!orderId) {
      return errorResponse('Keine PayPal-Order-ID angegeben.', 400)
    }

    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .select(
        'id, tournament_id, name, payment_method, payment_status, paypal_order_id, paypal_capture_id',
      )
      .eq('token', token)
      .maybeSingle()

    if (teamError) {
      console.error('Fehler beim Laden des Teams:', teamError)
      return errorResponse('Das Team konnte nicht geladen werden.', 500)
    }

    if (!team) {
      return errorResponse('Team nicht gefunden.', 404)
    }

    if (team.paypal_order_id !== orderId) {
      return errorResponse(
        'Diese PayPal-Bestellung ist diesem Team nicht zugeordnet.',
        409,
      )
    }

    if (team.payment_status === 'bezahlt') {
      if (
        team.payment_method === 'paypal' &&
        typeof team.paypal_capture_id === 'string' &&
        team.paypal_capture_id.length > 0
      ) {
        return NextResponse.json({
          success: true,
          already_paid: true,
          payment_method: 'paypal',
          payment_status: 'bezahlt',
          order_id: team.paypal_order_id,
          capture_id: team.paypal_capture_id,
          tournament_id: team.tournament_id,
        })
      }

      return errorResponse(
        'Dieses Team hat bereits bezahlt. Eine weitere PayPal-Zahlung ist nicht möglich.',
        409,
      )
    }

    if (team.payment_method !== 'paypal') {
      return errorResponse(
        'Für dieses Team ist PayPal nicht als Zahlungsart ausgewählt.',
        409,
      )
    }

    const { data: tournament, error: tournamentError } =
      await supabaseAdmin
        .from('tournaments')
        .select('id, name, slug, status')
        .eq('id', team.tournament_id)
        .maybeSingle()

    if (tournamentError) {
      console.error('Fehler beim Laden des Turniers:', tournamentError)
      return errorResponse('Das Turnier konnte nicht geladen werden.', 500)
    }

    if (!tournament) {
      return errorResponse(
        'Das zugehörige Turnier wurde nicht gefunden.',
        404,
      )
    }

    if (tournament.status !== 'active') {
      return errorResponse(
        'Dieses Turnier ist aktuell nicht verfügbar.',
        404,
      )
    }

    const { data: settings, error: settingsError } =
      await supabaseAdmin
        .from('tournament_settings')
        .select('entry_fee')
        .eq('tournament_id', tournament.id)
        .maybeSingle()

    if (settingsError) {
      console.error(
        'Fehler beim Laden der Teilnahmegebühr:',
        settingsError,
      )
      return errorResponse(
        'Die Teilnahmegebühr konnte nicht geladen werden.',
        500,
      )
    }

    const expectedAmount = Number(settings?.entry_fee ?? 10)

    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
      return errorResponse(
        'Die eingestellte Teilnahmegebühr ist ungültig.',
        500,
      )
    }

    const formattedExpectedAmount = expectedAmount.toFixed(2)
    const accessToken = await getPayPalAccessToken()

    const orderResponse = await fetch(
      `${paypalBaseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
        cache: 'no-store',
      },
    )

    const orderData = await readPayPalResponse(orderResponse)

    if (!orderResponse.ok) {
      console.error('PayPal Order Lookup Fehler:', orderData)
      return errorResponse(
        'Die PayPal-Bestellung konnte nicht geprüft werden.',
        502,
      )
    }

    const purchaseUnit = orderData?.purchase_units?.[0]

    if (String(purchaseUnit?.custom_id ?? '') !== String(team.id)) {
      console.error('PayPal Order gehört nicht zum Team:', {
        orderId,
        teamId: team.id,
        customId: purchaseUnit?.custom_id,
      })

      return errorResponse(
        'Die PayPal-Bestellung gehört nicht zu diesem Team.',
        409,
      )
    }

    if (
      !isExpectedMoney(
        purchaseUnit?.amount,
        formattedExpectedAmount,
      )
    ) {
      console.error('PayPal-Bestellbetrag stimmt nicht:', {
        orderId,
        actual: purchaseUnit?.amount,
        expected: formattedExpectedAmount,
      })

      return errorResponse(
        'Betrag oder Währung der PayPal-Bestellung stimmen nicht mit der Teilnahmegebühr überein.',
        409,
      )
    }

    /*
     * IDs lokal sichern. Diese Konstanten sind garantiert vorhanden,
     * weil team und tournament zuvor auf null geprüft wurden.
     */
    const teamId = team.id
    const tournamentId = tournament.id
    const tournamentSlug = tournament.slug

    async function markTeamAsPaid(captureId: string) {
      const { data: updatedTeam, error: updateError } =
        await supabaseAdmin
          .from('teams')
          .update({
            payment_method: 'paypal',
            payment_status: 'bezahlt',
            paypal_capture_id: captureId,
          })
          .eq('id', teamId)
          .eq('tournament_id', tournamentId)
          .eq('paypal_order_id', orderId)
          .eq('payment_method', 'paypal')
          .neq('payment_status', 'bezahlt')
          .select('id')
          .maybeSingle()

      if (updateError) {
        console.error(
          'Fehler beim Aktualisieren des Zahlungsstatus:',
          updateError,
        )
        return false
      }

      if (updatedTeam) return true

      const { data: currentTeam, error: currentTeamError } =
        await supabaseAdmin
          .from('teams')
          .select(
            'payment_status, payment_method, paypal_order_id, paypal_capture_id',
          )
          .eq('id', teamId)
          .eq('tournament_id', tournamentId)
          .maybeSingle()

      if (currentTeamError) {
        console.error(
          'Fehler beim erneuten Prüfen des Teamstatus:',
          currentTeamError,
        )
        return false
      }

      return (
        currentTeam?.payment_status === 'bezahlt' &&
        currentTeam?.payment_method === 'paypal' &&
        currentTeam?.paypal_order_id === orderId &&
        currentTeam?.paypal_capture_id === captureId
      )
    }

    if (orderData.status === 'COMPLETED') {
      const existingCapture = purchaseUnit?.payments?.captures?.[0]

      if (
        existingCapture?.status !== 'COMPLETED' ||
        typeof existingCapture.id !== 'string' ||
        !isExpectedMoney(
          existingCapture.amount,
          formattedExpectedAmount,
        )
      ) {
        return errorResponse(
          'Die abgeschlossene PayPal-Bestellung konnte nicht eindeutig bestätigt werden.',
          409,
        )
      }

      const updated = await markTeamAsPaid(existingCapture.id)

      if (!updated) {
        return errorResponse(
          'PayPal hat die Zahlung abgeschlossen, aber der Teamstatus konnte nicht sicher aktualisiert werden.',
          500,
        )
      }

      return NextResponse.json({
        success: true,
        already_captured: true,
        payment_method: 'paypal',
        payment_status: 'bezahlt',
        order_id: orderId,
        capture_id: existingCapture.id,
        tournament_id: tournamentId,
        tournament_slug: tournamentSlug,
      })
    }

    if (orderData.status !== 'APPROVED') {
      return NextResponse.json(
        {
          error:
            'Die PayPal-Bestellung wurde noch nicht zur Zahlung freigegeben.',
          paypal_status: orderData.status ?? null,
        },
        { status: 409 },
      )
    }

    const captureResponse = await fetch(
      `${paypalBaseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'PayPal-Request-Id': orderId,
        },
        cache: 'no-store',
      },
    )

    const captureData = await readPayPalResponse(captureResponse)

    if (!captureResponse.ok) {
      console.error('PayPal Capture Fehler:', captureData)

      const retryOrderResponse = await fetch(
        `${paypalBaseUrl}/v2/checkout/orders/${encodeURIComponent(orderId)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
          cache: 'no-store',
        },
      )

      const retryOrderData =
        await readPayPalResponse(retryOrderResponse)

      const retryPurchaseUnit = retryOrderData?.purchase_units?.[0]
      const retryCapture = retryPurchaseUnit?.payments?.captures?.[0]

      if (
        retryOrderResponse.ok &&
        retryOrderData.status === 'COMPLETED' &&
        String(retryPurchaseUnit?.custom_id ?? '') === String(teamId) &&
        isExpectedMoney(
          retryPurchaseUnit?.amount,
          formattedExpectedAmount,
        ) &&
        retryCapture?.status === 'COMPLETED' &&
        typeof retryCapture.id === 'string' &&
        isExpectedMoney(
          retryCapture.amount,
          formattedExpectedAmount,
        )
      ) {
        const updated = await markTeamAsPaid(retryCapture.id)

        if (!updated) {
          return errorResponse(
            'Die Zahlung ist bei PayPal abgeschlossen, aber der Teamstatus konnte nicht sicher aktualisiert werden.',
            500,
          )
        }

        return NextResponse.json({
          success: true,
          already_captured: true,
          payment_method: 'paypal',
          payment_status: 'bezahlt',
          order_id: orderId,
          capture_id: retryCapture.id,
          tournament_id: tournamentId,
          tournament_slug: tournamentSlug,
        })
      }

      return errorResponse(
        'Die PayPal-Zahlung konnte nicht abgeschlossen werden. Prüfe den Zahlungsstatus, bevor du es erneut versuchst.',
        502,
      )
    }

    if (captureData.status !== 'COMPLETED') {
      console.error('PayPal Order nicht abgeschlossen:', captureData)

      return NextResponse.json(
        {
          error:
            'PayPal hat die Zahlung noch nicht als abgeschlossen bestätigt.',
          paypal_status: captureData.status ?? null,
        },
        { status: 409 },
      )
    }

    const capture = captureData?.purchase_units?.[0]?.payments?.captures?.[0]

    if (
      !capture ||
      capture.status !== 'COMPLETED' ||
      typeof capture.id !== 'string' ||
      !isExpectedMoney(
        capture.amount,
        formattedExpectedAmount,
      )
    ) {
      console.error(
        'PayPal-Capture nicht eindeutig bestätigt:',
        captureData,
      )

      return errorResponse(
        'Die PayPal-Zahlung konnte nicht eindeutig bestätigt werden.',
        409,
      )
    }

    const updated = await markTeamAsPaid(capture.id)

    if (!updated) {
      return errorResponse(
        'PayPal hat die Zahlung durchgeführt, aber der Teamstatus konnte nicht sicher aktualisiert werden. Bitte nicht erneut bezahlen und den Zahlungsstatus prüfen.',
        500,
      )
    }

    return NextResponse.json({
      success: true,
      payment_method: 'paypal',
      payment_status: 'bezahlt',
      order_id: orderId,
      capture_id: capture.id,
      tournament_id: tournamentId,
      tournament_slug: tournamentSlug,
    })
  } catch (error) {
    console.error(
      'Unerwarteter Fehler in /api/paypal/capture-order:',
      error,
    )

    return errorResponse(
      'Es ist ein unerwarteter Fehler aufgetreten.',
      500,
    )
  }
}

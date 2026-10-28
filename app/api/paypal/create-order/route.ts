
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

async function getPayPalAccessToken(): Promise<string> {
  const credentials = Buffer.from(
    `${paypalClientId}:${paypalClientSecret}`,
  ).toString('base64')

  const response = await fetch(
    `${paypalBaseUrl}/v1/oauth2/token`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      cache: 'no-store',
    },
  )

  if (!response.ok) {
    const errorText = await response.text()
    console.error('PayPal Access Token Fehler:', errorText)
    throw new Error('PayPal-Zugang konnte nicht hergestellt werden.')
  }

  const data = await response.json()

  if (typeof data?.access_token !== 'string') {
    throw new Error('PayPal hat kein gültiges Access Token zurückgegeben.')
  }

  return data.access_token
}

async function readPayPalResponse(response: Response): Promise<any> {
  const text = await response.text()

  if (!text) {
    return {}
  }

  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

function isExpectedMoney(
  money: any,
  expectedAmount: string,
): boolean {
  if (
    !money ||
    money.currency_code !== 'EUR' ||
    typeof money.value !== 'string'
  ) {
    return false
  }

  const value = Number(money.value)

  return (
    Number.isFinite(value) &&
    value.toFixed(2) === expectedAmount
  )
}

function errorResponse(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status },
  )
}

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const token =
      typeof body?.token === 'string'
        ? body.token.trim()
        : ''

    if (!token) {
      return errorResponse('Kein Team-Link angegeben.', 400)
    }

    const {
      data: team,
      error: teamError,
    } = await supabaseAdmin
      .from('teams')
      .select(
        'id, tournament_id, name, payment_method, payment_status, paypal_order_id',
      )
      .eq('token', token)
      .maybeSingle()

    if (teamError) {
      console.error('Fehler beim Laden des Teams:', teamError)
      return errorResponse(
        'Das Team konnte nicht geladen werden.',
        500,
      )
    }

    if (!team) {
      return errorResponse('Team nicht gefunden.', 404)
    }

    if (team.payment_status === 'bezahlt') {
      return errorResponse(
        'Dieses Team hat bereits bezahlt. Bitte lade die Seite neu.',
        409,
      )
    }

    if (team.payment_method !== 'paypal') {
      return errorResponse(
        'Für dieses Team ist PayPal nicht als Zahlungsart ausgewählt.',
        409,
      )
    }

    const {
      data: tournament,
      error: tournamentError,
    } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, slug, status')
      .eq('id', team.tournament_id)
      .maybeSingle()

    if (tournamentError) {
      console.error(
        'Fehler beim Laden des Turniers:',
        tournamentError,
      )

      return errorResponse(
        'Das Turnier konnte nicht geladen werden.',
        500,
      )
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

    const {
      data: settings,
      error: settingsError,
    } = await supabaseAdmin
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

    const amount = Number(settings?.entry_fee ?? 10)

    if (!Number.isFinite(amount) || amount <= 0) {
      return errorResponse(
        'Die eingestellte Teilnahmegebühr ist ungültig.',
        500,
      )
    }

    const formattedAmount = amount.toFixed(2)
    const accessToken = await getPayPalAccessToken()

    /*
     * Vorhandene PayPal-Bestellung prüfen.
     * Solange sie offen oder noch nicht eindeutig
     * abgeschlossen ist, wird keine neue erstellt.
     */
    if (team.paypal_order_id) {
      const existingOrderId = team.paypal_order_id

      const existingOrderResponse = await fetch(
        `${paypalBaseUrl}/v2/checkout/orders/${encodeURIComponent(
          existingOrderId,
        )}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/json',
          },
          cache: 'no-store',
        },
      )

      const existingOrderData =
        await readPayPalResponse(existingOrderResponse)

      if (!existingOrderResponse.ok) {
        console.error(
          'Bestehende PayPal-Bestellung konnte nicht geprüft werden:',
          {
            status: existingOrderResponse.status,
            orderId: existingOrderId,
            response: existingOrderData,
          },
        )

        return errorResponse(
          'Die vorhandene PayPal-Bestellung konnte nicht sicher geprüft werden. Es wurde keine neue Bestellung erstellt. Bitte versuche es später erneut.',
          502,
        )
      }

      const existingStatus = existingOrderData?.status

      /*
       * Eine abgeschlossene Zahlung niemals erneut starten.
       * Wenn PayPal den Abschluss bestätigt, gleichen wir
       * den Teamstatus nur nach vollständiger Prüfung ab.
       */
      if (existingStatus === 'COMPLETED') {
        const purchaseUnit =
          existingOrderData?.purchase_units?.[0]

        const capture =
          purchaseUnit?.payments?.captures?.[0]

        const correctTeam =
          String(purchaseUnit?.custom_id ?? '') ===
          String(team.id)

        const correctOrderAmount = isExpectedMoney(
          purchaseUnit?.amount,
          formattedAmount,
        )

        const correctCaptureAmount = isExpectedMoney(
          capture?.amount,
          formattedAmount,
        )

        if (
          !correctTeam ||
          !correctOrderAmount ||
          !correctCaptureAmount ||
          capture?.status !== 'COMPLETED'
        ) {
          console.error(
            'Abgeschlossene PayPal-Bestellung konnte nicht sicher zugeordnet werden:',
            {
              orderId: existingOrderId,
              teamId: team.id,
              status: existingStatus,
            },
          )

          return errorResponse(
            'PayPal meldet eine abgeschlossene Bestellung, deren Zahlung nicht eindeutig geprüft werden konnte. Bitte nicht erneut bezahlen und den Veranstalter kontaktieren.',
            409,
          )
        }

        const {
          data: updatedTeam,
          error: updateError,
        } = await supabaseAdmin
          .from('teams')
          .update({
            payment_status: 'bezahlt',
            payment_method: 'paypal',
            paypal_capture_id: capture.id,
          })
          .eq('id', team.id)
          .eq('tournament_id', team.tournament_id)
          .eq('paypal_order_id', existingOrderId)
          .eq('payment_method', 'paypal')
          .select('id')
          .maybeSingle()

        if (updateError) {
          console.error(
            'Fehler beim Abgleichen der abgeschlossenen PayPal-Zahlung:',
            updateError,
          )

          return errorResponse(
            'Die Zahlung ist bei PayPal abgeschlossen, aber der Teamstatus konnte nicht aktualisiert werden. Bitte nicht erneut bezahlen und den Veranstalter kontaktieren.',
            500,
          )
        }

        if (!updatedTeam) {
          return errorResponse(
            'Der Teamstatus wurde zwischenzeitlich geändert. Bitte lade die Seite neu und prüfe den Zahlungsstatus.',
            409,
          )
        }

        return errorResponse(
          'Die PayPal-Zahlung war bereits abgeschlossen. Der Zahlungsstatus wurde aktualisiert. Bitte lade die Seite neu.',
          409,
        )
      }

      /*
       * Diese Bestellungen dürfen weiterverwendet werden.
       * Dadurch führt ein abgebrochener Checkout nicht
       * automatisch zu einer neuen Order.
       */
      if (
        existingStatus === 'CREATED' ||
        existingStatus === 'SAVED' ||
        existingStatus === 'APPROVED' ||
        existingStatus === 'PAYER_ACTION_REQUIRED'
      ) {
        const purchaseUnit =
          existingOrderData?.purchase_units?.[0]

        if (
          String(purchaseUnit?.custom_id ?? '') !==
            String(team.id) ||
          !isExpectedMoney(
            purchaseUnit?.amount,
            formattedAmount,
          )
        ) {
          console.error(
            'Bestehende PayPal-Bestellung stimmt nicht mit dem Team oder Betrag überein:',
            {
              orderId: existingOrderId,
              teamId: team.id,
              status: existingStatus,
            },
          )

          return errorResponse(
            'Die vorhandene PayPal-Bestellung stimmt nicht mit der Anmeldung überein. Bitte kontaktiere den Veranstalter.',
            409,
          )
        }

        return NextResponse.json(
          {
            success: true,
            order_id: existingOrderId,
            amount: formattedAmount,
            currency: 'EUR',
            tournament_id: tournament.id,
            tournament_slug: tournament.slug,
            reused_order: true,
          },
          { status: 200 },
        )
      }

      /*
       * Nur VOIDED bedeutet hier, dass die alte Order
       * nicht mehr bezahlt werden kann. Erst dann wird
       * genau diese gespeicherte Order-ID freigegeben.
       */
      if (existingStatus === 'VOIDED') {
        const {
          data: releasedTeam,
          error: releaseError,
        } = await supabaseAdmin
          .from('teams')
          .update({
            paypal_order_id: null,
          })
          .eq('id', team.id)
          .eq('tournament_id', team.tournament_id)
          .eq('paypal_order_id', existingOrderId)
          .eq('payment_method', 'paypal')
          .neq('payment_status', 'bezahlt')
          .select('id')
          .maybeSingle()

        if (releaseError) {
          console.error(
            'Fehler beim Freigeben der ungültigen PayPal-Bestellung:',
            releaseError,
          )

          return errorResponse(
            'Die alte PayPal-Bestellung konnte nicht freigegeben werden. Bitte versuche es später erneut.',
            500,
          )
        }

        if (!releasedTeam) {
          return errorResponse(
            'Die Anmeldung wurde zwischenzeitlich geändert. Bitte lade die Seite neu.',
            409,
          )
        }
      } else {
        /*
         * Unbekannte oder nicht eindeutig endgültige Status
         * dürfen niemals automatisch ersetzt werden.
         */
        return errorResponse(
          'Der Status der vorhandenen PayPal-Bestellung ist nicht eindeutig. Es wurde keine neue Bestellung erstellt. Bitte kontaktiere den Veranstalter.',
          409,
        )
      }
    }

    /*
     * Es gibt keine gespeicherte Bestellung mehr
     * oder die alte wurde nach bestätigtem VOIDED freigegeben.
     */
    const paypalResponse = await fetch(
      `${paypalBaseUrl}/v2/checkout/orders`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          intent: 'CAPTURE',
          purchase_units: [
            {
              description: `${tournament.name} – ${team.name}`,
              custom_id: String(team.id),
              amount: {
                currency_code: 'EUR',
                value: formattedAmount,
              },
            },
          ],
        }),
        cache: 'no-store',
      },
    )

    const paypalData = await readPayPalResponse(paypalResponse)

    if (
      !paypalResponse.ok ||
      typeof paypalData?.id !== 'string'
    ) {
      console.error('PayPal Order Fehler:', paypalData)

      return errorResponse(
        'Die PayPal-Zahlung konnte nicht vorbereitet werden.',
        502,
      )
    }

    const orderId = paypalData.id

    /*
     * Die Order-ID atomar beanspruchen.
     * Die Datenbankfunktion verhindert, dass zwei
     * parallele Anfragen unterschiedliche Orders
     * für dasselbe Team hinterlegen.
     */
    const {
      data: claimed,
      error: claimError,
    } = await supabaseAdmin.rpc('claim_paypal_order', {
      p_team_id: team.id,
      p_order_id: orderId,
    })

    if (claimError) {
      console.error(
        'Fehler beim Beanspruchen der PayPal-Order:',
        claimError,
      )

      return errorResponse(
        'Die Bestellung wurde erstellt, konnte aber nicht sicher zugeordnet werden. Bitte nicht erneut bezahlen und den Veranstalter kontaktieren.',
        500,
      )
    }

    if (claimed !== true) {
      return errorResponse(
        'Für dieses Team wurde bereits eine Bestellung beansprucht oder die Zahlungsart wurde geändert. Bitte lade die Seite neu.',
        409,
      )
    }

    return NextResponse.json(
      {
        success: true,
        order_id: orderId,
        amount: formattedAmount,
        currency: 'EUR',
        tournament_id: tournament.id,
        tournament_slug: tournament.slug,
        reused_order: false,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error(
      'Unerwarteter Fehler in /api/paypal/create-order:',
      error,
    )

    return errorResponse(
      'Es ist ein unerwarteter Fehler aufgetreten.',
      500,
    )
  }
}

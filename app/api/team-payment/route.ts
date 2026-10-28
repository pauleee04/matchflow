
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  throw new Error('Supabase URL oder SUPABASE_SERVICE_ROLE_KEY fehlt.')
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

type PaymentMethod = 'bar' | 'paypal' | 'ueberweisung'

export async function POST(request: Request) {
  try {
    const body = await request.json()

    const token =
      typeof body?.token === 'string' ? body.token.trim() : ''

    const paymentMethod =
      typeof body?.payment_method === 'string'
        ? body.payment_method.trim().toLowerCase()
        : ''

    if (!token) {
      return NextResponse.json(
        { error: 'Kein Team-Link angegeben.' },
        { status: 400 },
      )
    }

    if (
      paymentMethod !== 'bar' &&
      paymentMethod !== 'paypal' &&
      paymentMethod !== 'ueberweisung'
    ) {
      return NextResponse.json(
        { error: 'Ungültige Zahlungsart.' },
        { status: 400 },
      )
    }

    const method = paymentMethod as PaymentMethod

    const { data: team, error: teamError } = await supabaseAdmin
      .from('teams')
      .select('id, tournament_id, payment_status')
      .eq('token', token)
      .maybeSingle()

    if (teamError) {
      console.error('Fehler beim Laden des Teams:', teamError)
      return NextResponse.json(
        { error: 'Das Team konnte nicht geladen werden.' },
        { status: 500 },
      )
    }

    if (!team) {
      return NextResponse.json(
        { error: 'Team nicht gefunden.' },
        { status: 404 },
      )
    }

    const { data: tournament, error: tournamentError } =
      await supabaseAdmin
        .from('tournaments')
        .select(
          'id, status, cash_enabled, paypal_enabled, bank_transfer_enabled',
        )
        .eq('id', team.tournament_id)
        .maybeSingle()

    if (tournamentError) {
      console.error('Fehler beim Laden des Turniers:', tournamentError)
      return NextResponse.json(
        { error: 'Das Turnier konnte nicht geladen werden.' },
        { status: 500 },
      )
    }

    if (!tournament || tournament.status !== 'active') {
      return NextResponse.json(
        { error: 'Dieses Turnier ist aktuell nicht verfügbar.' },
        { status: 404 },
      )
    }

    if (team.payment_status === 'bezahlt') {
      return NextResponse.json(
        {
          error:
            'Die Zahlungsart kann nach erfolgreicher Zahlung nicht mehr geändert werden.',
        },
        { status: 409 },
      )
    }

    const enabled =
      method === 'bar'
        ? tournament.cash_enabled
        : method === 'paypal'
          ? tournament.paypal_enabled
          : tournament.bank_transfer_enabled

    if (!enabled) {
      return NextResponse.json(
        {
          error:
            'Diese Zahlungsart ist für das Turnier nicht aktiviert.',
        },
        { status: 400 },
      )
    }

    const { error: updateError } = await supabaseAdmin
      .from('teams')
      .update({ payment_method: method })
      .eq('id', team.id)
      .eq('tournament_id', team.tournament_id)

    if (updateError) {
      console.error(
        'Fehler beim Ändern der Zahlungsart:',
        updateError,
      )
      return NextResponse.json(
        { error: 'Die Zahlungsart konnte nicht geändert werden.' },
        { status: 500 },
      )
    }

    return NextResponse.json(
      {
        success: true,
        payment_method: method,
        payment_status: team.payment_status,
        tournament_id: tournament.id,
      },
      { status: 200 },
    )
  } catch (error) {
    console.error('Unerwarteter Fehler in /api/team-payment:', error)

    return NextResponse.json(
      { error: 'Es ist ein unerwarteter Fehler aufgetreten.' },
      { status: 500 },
    )
  }
}

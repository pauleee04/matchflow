export type TournamentMatch = {
    id: number
    group_id: number
    team1_id: number
    team2_id: number
    table_number: number | null
    scheduled_time: string | null
    phase: string
    team1_score: number | null
    team2_score: number | null
    status: string
  }
  
  export type TournamentTeam = {
    id: number
    name: string
  }
  
  export type TournamentGroupMember = {
    group_id: number
    team_id: number
  }
  
  export type TournamentStanding = {
    teamId: number
    teamName: string
    games: number
    wins: number
    draws: number
    losses: number
    points: number
    scoreFor: number
    scoreAgainst: number
    scoreDifference: number
  }
  
  export function calculateStandings(
    groupId: number,
    teams: TournamentTeam[],
    members: TournamentGroupMember[],
    matches: TournamentMatch[]
  ): TournamentStanding[] {
    const groupTeamIds = members
      .filter(
        (member) =>
          member.group_id === groupId
      )
      .map(
        (member) => member.team_id
      )
  
    const groupTeams = teams.filter(
      (team) =>
        groupTeamIds.includes(team.id)
    )
  
    const standings =
      groupTeams.map((team) => {
        let games = 0
        let wins = 0
        let draws = 0
        let losses = 0
        let points = 0
  
        let scoreFor = 0
        let scoreAgainst = 0
  
        matches
          .filter(
            (match) =>
              match.group_id === groupId &&
              match.phase === 'group' &&
              match.status === 'finished' &&
              (match.team1_id === team.id ||
                match.team2_id === team.id)
          )
          .forEach((match) => {
            const isTeam1 =
              match.team1_id === team.id
  
            const ownScore = isTeam1
              ? match.team1_score
              : match.team2_score
  
            const opponentScore = isTeam1
              ? match.team2_score
              : match.team1_score
  
            if (
              ownScore === null ||
              opponentScore === null
            ) {
              return
            }
  
            games++
  
            scoreFor += ownScore
            scoreAgainst += opponentScore
  
            if (
              ownScore > opponentScore
            ) {
              wins++
              points += 3
            } else if (
              ownScore === opponentScore
            ) {
              draws++
              points += 1
            } else {
              losses++
            }
          })
  
        return {
          teamId: team.id,
          teamName: team.name,
          games,
          wins,
          draws,
          losses,
          points,
          scoreFor,
          scoreAgainst,
          scoreDifference:
            scoreFor - scoreAgainst,
        }
      })
  
    standings.sort((a, b) => {
      if (b.points !== a.points) {
        return b.points - a.points
      }
  
      if (
        b.scoreDifference !==
        a.scoreDifference
      ) {
        return (
          b.scoreDifference -
          a.scoreDifference
        )
      }
  
      if (
        b.scoreFor !==
        a.scoreFor
      ) {
        return (
          b.scoreFor -
          a.scoreFor
        )
      }
  
      return a.teamName.localeCompare(
        b.teamName
      )
    })
  
    return standings
  }
  
  export function getWinner(
    match: TournamentMatch
  ) {
    if (
      match.team1_score === null ||
      match.team2_score === null
    ) {
      return null
    }
  
    if (
      match.team1_score >
      match.team2_score
    ) {
      return match.team1_id
    }
  
    if (
      match.team2_score >
      match.team1_score
    ) {
      return match.team2_id
    }
  
    return null
  }
  
  export function getLoser(
    match: TournamentMatch
  ) {
    if (
      match.team1_score === null ||
      match.team2_score === null
    ) {
      return null
    }
  
    if (
      match.team1_score <
      match.team2_score
    ) {
      return match.team1_id
    }
  
    if (
      match.team2_score <
      match.team1_score
    ) {
      return match.team2_id
    }
  
    return null
  }
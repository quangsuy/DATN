import React, { useState } from 'react';
import { ScreenType, GameMode, PlayerColor, TeamColors } from './types';
import { HomeScreen } from './screens/HomeScreen';
import { GameModeScreen } from './screens/GameModeScreen';
import { GameScreen } from './screens/GameScreen';
import { DashboardScreen } from './screens/DashboardScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { sound } from './utils/sound';

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('home');
  const [gameMode, setGameMode] = useState<GameMode>('pva');
  const [playerColor, setPlayerColor] = useState<PlayerColor>('cyan');
  const [firstPlayer, setFirstPlayer] = useState<1 | 2>(1);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [teamColors, setTeamColors] = useState<TeamColors>({ team1: '#00ffff', team2: '#f97316' });

  const toggleSound = () => {
    const next = !soundEnabled;
    setSoundEnabled(next);
    sound.enabled = next;
  };

  const handleStartGame = (mode: GameMode, color: PlayerColor, first: 1 | 2, colors: TeamColors) => {
    setGameMode(mode);
    setPlayerColor(color);
    setFirstPlayer(first);
    setTeamColors(colors);
    setCurrentScreen('game');
  };

  return (
    <div className="w-full min-h-screen bg-slate-950 font-sans text-slate-100 selection:bg-cyan-500 selection:text-slate-950">
      {currentScreen === 'home' && (
        <HomeScreen
          onNavigate={(screen) => setCurrentScreen(screen)}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
        />
      )}

      {currentScreen === 'game_mode' && (
        <GameModeScreen
          onStartGame={handleStartGame}
          onBack={() => setCurrentScreen('home')}
        />
      )}

      {currentScreen === 'game' && (
        <GameScreen
          gameMode={gameMode}
          playerColor={playerColor}
          firstPlayer={firstPlayer}
          soundEnabled={soundEnabled}
          teamColors={teamColors}
          onToggleSound={toggleSound}
          onBackToMenu={() => setCurrentScreen('home')}
          onOpenDashboard={() => setCurrentScreen('dashboard')}
        />
      )}

      {currentScreen === 'dashboard' && (
        <DashboardScreen
          onBack={() => setCurrentScreen('home')}
          onPlayGame={() => setCurrentScreen('game')}
          teamColors={teamColors}
        />
      )}

      {currentScreen === 'settings' && (
        <SettingsScreen
          onBack={() => setCurrentScreen('home')}
          soundEnabled={soundEnabled}
          onToggleSound={toggleSound}
        />
      )}
    </div>
  );
}

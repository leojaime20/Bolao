import { useState, useCallback, useRef, useEffect } from 'react';
import BottomNav from './components/BottomNav';
import Schedule from './pages/Schedule';
import MyMatches from './pages/MyMatches';
import Teams from './pages/Teams';
import Missing from './pages/Missing';
import Bets from './pages/Bets';
import Rules from './pages/Rules';
import TeamProfile from './pages/TeamProfile';
import LibertadoresTest from './pages/LibertadoresTest';
import HamburgerMenu from './components/HamburgerMenu';
import PoolSelector from './components/PoolSelector';
import PoolManager from './components/PoolManager';
import AuthScreen from './components/AuthScreen';
import LanguageSwitcher from './components/LanguageSwitcher';
import InstallBanner from './components/InstallBanner';
import { useFavorites } from './hooks/useFavorites';
import { useLanguage } from './i18n/LanguageContext';
import { useAuth } from './hooks/useAuth';
import Admin from './pages/Admin';
import logo from './assets/logo.png';
import './App.css';

const ADMIN_UID = import.meta.env.VITE_ADMIN_UID;

export default function App() {
  const [page, setPage] = useState('schedule');
  const [animClass, setAnimClass] = useState('page-enter-done');
  const [teamIso, setTeamIso] = useState(null);
  const prevPageRef = useRef('schedule');
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const { t } = useLanguage();
  const { user, profile, loading } = useAuth();
  const isAdmin = user?.uid && user.uid === ADMIN_UID;

  const navigate = useCallback((newPage) => {
    if (newPage === page) return;
    // Silent redirect for non-admin trying to access admin
    if (newPage === 'admin' && !isAdmin) {
      return;
    }
    setAnimClass('page-exit');
    setTimeout(() => {
      setPage(newPage);
      setAnimClass('page-enter');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimClass('page-enter-done');
        });
      });
    }, 150);
  }, [page, isAdmin]);

  const navigateToTeam = useCallback((iso) => {
    prevPageRef.current = page;
    setTeamIso(iso);
    setAnimClass('page-exit');
    setTimeout(() => {
      setPage('team');
      setAnimClass('page-enter');
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setAnimClass('page-enter-done');
        });
      });
    }, 150);
  }, [page]);

  const navigateBackFromTeam = useCallback(() => {
    navigate(prevPageRef.current);
  }, [navigate]);

  // Handle #admin hash navigation
  useEffect(() => {
    const handleHash = () => {
      if (window.location.hash === '#admin' && isAdmin) {
        setPage('admin');
      }
    };
    handleHash();
    window.addEventListener('hashchange', handleHash);
    return () => window.removeEventListener('hashchange', handleHash);
  }, [isAdmin]);

  if (loading) {
    return (
      <div className="app">
        <div className="app-loading">
          <img src={logo} alt="Mundial 2026" className="app-header__logo" />
          <span className="app-loading__text">⚽</span>
        </div>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="app-header__content">
          {profile?.nickname && <HamburgerMenu onNavigate={navigate} />}
          <img src={logo} alt="Mundial 2026" className="app-header__logo" />
          <h1 className="app-header__title">
            <span className="app-header__mundial">{t('appTitle')}</span>{' '}
            <span className="app-header__year">{t('appYear')}</span>
          </h1>
          <LanguageSwitcher />
        </div>
        {profile?.nickname && (
          <PoolSelector onManagePools={() => navigate('pools')} />
        )}
      </header>

      {!profile || !profile.nickname ? (
        <AuthScreen />
      ) : (
        <>
          <main className="app-main">
            <div className={`page-wrapper ${animClass}`}>
              {page === 'schedule' && <Schedule onTeamClick={navigateToTeam} />}
              {page === 'my-matches' && (
                <MyMatches favorites={favorites} onNavigate={navigate} onTeamClick={navigateToTeam} />
              )}
              {page === 'teams' && (
                <Teams
                  favorites={favorites}
                  toggleFavorite={toggleFavorite}
                  isFavorite={isFavorite}
                  onTeamClick={navigateToTeam}
                />
              )}
              {page === 'bets' && <Bets onTeamClick={navigateToTeam} />}
              {page === 'libertadores' && <LibertadoresTest />}
              {page === 'team' && (
                <TeamProfile
                  iso={teamIso}
                  onBack={navigateBackFromTeam}
                  onTeamClick={navigateToTeam}
                />
              )}
              {page === 'pools' && <PoolManager />}
              {page === 'rules' && <Rules />}
              {page === 'missing' && <Missing />}
              {page === 'admin' && isAdmin && <Admin />}
            </div>
          </main>

          <InstallBanner />

          <BottomNav
            active={page === 'team' ? prevPageRef.current : page}
            onNavigate={navigate}
            favoriteCount={favorites.length}
          />
        </>
      )}
    </div>
  );
}

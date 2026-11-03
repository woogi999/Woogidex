// The site's part of Settings (js/app/pages/SettingsPage.tsx in Core): who
// you are, the Notifications and Account sections, and Cloud backup under
// Data & Storage. Registered by registerAccountSettings(), from js/host.ts.

import { useId, type ReactNode } from 'react';
import { api, state } from '../../core/app.ts';
import { registerSettingsGroup, registerSettingsSection, ext } from '../../core/extend.ts';
import { Icon } from '../components/Icon.tsx';
import { Avatar } from '../components/Avatar.tsx';
import {
    ACCOUNT_DELETION_GRACE_DAYS, accountDeletionDueAt, cancelAccountDeletion, formatDue, openDeleteAccountModal
} from '../../features/account-deletion.ts';
import {
    cloudState, deleteCloudBackup, isAutoBackupOn, openCloudBackupModal, refreshCloudBackupUI, setCloudAutoBackup
} from '../../features/cloud-save.ts';
import { CloudMeters } from '../components/CloudMeters.tsx';
import { ConnectedAccounts } from '../components/ConnectedAccounts.tsx';
import { NOTIFICATION_KINDS, notificationPrefs, setNotificationPref } from '../../core/notifications.ts';
import { myPrivacy, setMyPrivacy } from '../../features/social.ts';
import { GroupHead, Switch } from './SettingsPage.tsx';
import { BusinessSettingsGroup } from '../components/business.tsx';
import { HiddenCommentsGroup, HiddenWordsGroup, MyReportsGroup, StandingGroup } from './SettingsSafety.tsx';

const signedIn = () => !!state.user;

export function registerAccountSettings(): void {
    ext.settingsIdentity = IdentityCard;
    ext.settingsOpened.push(() => {
        if (!state.user) return;
        refreshCloudBackupUI();
        api.updateConnectedAccountsUI?.();
    });
    registerSettingsSection({
        key: 'notifications', label: 'Notifications', when: signedIn, order: 30,
        blurb: 'Choose what you hear about.',
        groups: [
            { id: 'notifications', title: 'Notify me about', render: () => <NotificationsGroup />, keywords: 'notifications alerts bell follow comments wall repost share pause mute mentions tagged events announcements email' }
        ]
    });
    registerSettingsSection({
        key: 'account', label: 'Account', when: signedIn, order: 40,
        blurb: 'Your profile, how you sign in, and linked accounts.',
        groups: [
            {
                id: 'profile', title: 'Profile',
                items: [
                    { id: 'edit-profile', label: 'Edit your profile', desc: 'Change your display name, bio, avatar, username and badges.', control: () => <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.showProfileView(null, { edit: true })}>Edit Profile</button> }
                ]
            },
            { id: 'privacy', title: 'Mentions & discovery', render: () => <PrivacyGroup />, keywords: 'privacy mention tag tagged search suggestions suggested hidden discover find' },
            {
                id: 'security', title: 'Security',
                items: [
                    { id: 'password', label: 'Password', desc: 'Change the password you use to sign in with your username or email.', control: () => <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.openChangePasswordModal()}>Change Password</button> }
                ]
            },
            {
                id: 'connected', title: 'Connected accounts', keywords: 'google discord sign in link provider',
                render: () => <ConnectedAccounts className="st-group st-connected" heading={<GroupHead title="Connected accounts" />} />
            },
            { id: 'danger', title: 'Danger zone', keywords: 'delete account remove', render: () => <AccountDeletionGroup /> }
        ]
    });
    registerSettingsSection({
        key: 'safety', label: 'Safety', when: signedIn, order: 35,
        blurb: 'Hidden words, your account standing, appeals and your reports.',
        groups: [
            { id: 'hidden-words', title: 'Hidden words', keywords: 'hidden words filter block comments spam hide', render: () => <SafetyGroup title="Hidden words" desc="Hide comments on your things that use these words."><HiddenWordsGroup /></SafetyGroup> },
            { id: 'hidden-comments', title: 'Hidden comments', keywords: 'hidden comments unhide restrict', render: () => <SafetyGroup title="Hidden comments" desc="Comments hidden by your words, or by you."><HiddenCommentsGroup /></SafetyGroup> },
            { id: 'standing', title: 'Account standing', keywords: 'warning strike mute suspend ban appeal moderation standing', render: () => <SafetyGroup title="Account standing" desc="Moderation on your account, and appeals."><StandingGroup /></SafetyGroup> },
            { id: 'reports', title: 'Your reports', keywords: 'report reports flag status', render: () => <SafetyGroup title="Your reports" desc="What happened to the things you reported."><MyReportsGroup /></SafetyGroup> }
        ]
    });
    registerSettingsGroup('account', { id: 'business', title: 'Business', when: () => !!api.isBusiness?.(), keywords: 'business brand category contact email insights pinned', render: () => <BusinessSettingsGroup /> }, 'privacy');
    registerSettingsGroup('data', { id: 'cloud', title: 'Cloud backup', when: signedIn, keywords: 'cloud backup restore upload server', render: () => <CloudBackupGroup /> });
}

function SafetyGroup({ title, desc, children }: { title: string; desc: string; children: ReactNode }) {
    return (
        <section className="st-group">
            <GroupHead title={title} desc={desc} />
            <div className="st-card safety-card">{children}</div>
        </section>
    );
}

/** Who is signed in, or why you might want to be. */
export function IdentityCard() {
    const user = state.user;
    if (!user) {
        return (
            <div className="st-identity is-guest">
                <span className="st-identity-avatar"><Icon name="user" size={20} /></span>
                <span className="st-identity-text">
                    <strong>You're not signed in</strong>
                    <small>Sign in to back up your collection and share it in the Community Hub.</small>
                </span>
                <button type="button" className="btn btn-primary btn-sm" onClick={() => api.openAuthModal('signin')}>Sign In</button>
            </div>
        );
    }
    const name = user.displayName || user.username || 'Your profile';
    return (
        <button type="button" className="st-identity" onClick={() => api.showProfileView()}>
            <span className="st-identity-avatar"><Avatar userId={user.id} url={user.avatarUrl} name={name} className="st-avatar-img" /></span>
            <span className="st-identity-text">
                <strong>{name}</strong>
                <small>{user.username ? '@' + user.username : 'View your profile'}</small>
            </span>
            <Icon name="chevron-right" size={16} className="st-nav-chevron" />
        </button>
    );
}


// ---- account: danger zone ----

function AccountDeletionGroup() {
    const due: Date | null = accountDeletionDueAt();
    return (
        <section className="st-group">
            <GroupHead title="Danger zone" />
            <div className="st-card">
                <div className="st-row st-row-static is-danger">
                    <span className="st-row-text">
                        <span className="st-label">Delete account</span>
                        <span className="st-desc">{due
                            ? `This account is scheduled for permanent deletion on ${formatDue(due)}. Cancel any time before then and nothing is lost.`
                            : `Permanently delete your account and everything on it. Nothing is destroyed for ${ACCOUNT_DELETION_GRACE_DAYS} days, so you can change your mind.`}</span>
                    </span>
                    <span className="st-row-control">
                        {due
                            ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => cancelAccountDeletion()}>Cancel Deletion</button>
                            : <button type="button" className="btn btn-danger btn-sm" onClick={() => openDeleteAccountModal()}>Delete Account</button>}
                    </span>
                </div>
            </div>
        </section>
    );
}

// ---- data: cloud backup ----

function CloudBackupGroup() {
    const cs = cloudState();
    const autoOn = isAutoBackupOn();
    const autoId = useId();
    return (
        <section className="st-group">
            <GroupHead title="Cloud backup" desc="A private copy on our server, so you can get your collection back on a new device or after clearing your browser. Only you can see it." />
            <div className="st-card">
                <div className="st-row st-row-static st-row-meters">
                    <CloudMeters className="cloud-meters settings-cloud-meters" />
                </div>
                <div className={`st-row st-row-static${cs.savedAt ? ' is-on' : ''}`}>
                    <span className="st-row-text">
                        <span className="st-label">Back up to your account</span>
                        <span className="st-desc">You choose exactly which Fakémon, moves, abilities, items and regions go in, up to the allowance above. It is separate from publishing to the Community Hub.</span>
                        <span className="st-desc st-desc-status">
                            {cs.savedAt
                                ? `Last backed up ${new Date(cs.savedAt).toLocaleString()}, ${cs.byId.size} Fakémon stored.`
                                : (cs.loaded ? 'No cloud backup yet.' : 'Checking your cloud backup…')}
                        </span>
                    </span>
                    <span className="st-row-control"><button type="button" className="btn btn-primary btn-sm" onClick={() => openCloudBackupModal('upload')}>Choose &amp; Back Up</button></span>
                </div>
                <div className="st-row st-row-static">
                    <span className="st-row-text">
                        <span className="st-label">Restore from your backup</span>
                        <span className="st-desc">Copies the entries you tick onto this device. Anything already here is left alone unless you tick it, in which case the backed-up version replaces it. Nothing is ever deleted.</span>
                    </span>
                    <span className="st-row-control"><button type="button" className="btn btn-secondary btn-sm" disabled={!cs.savedAt} onClick={() => openCloudBackupModal('restore')}>Choose &amp; Restore</button></span>
                </div>
                {/* only for accounts a badge allows it, while the site-wide switch is on */}
                {cs.limits.autoBackup && (
                    <label className={`st-row${autoOn ? ' is-on' : ''}`}>
                        <span className="st-row-text">
                            <span className="st-label" id={autoId}>Keep my backup up to date automatically</span>
                            <span className="st-desc">Re-uploads the entries you already picked whenever you edit them, a few minutes after you stop. It never adds anything you did not choose, and a Fakémon you delete here does leave the backup, so it mirrors your picks rather than being a second collection.</span>
                            {autoOn && <span className="st-desc st-desc-status">{cs.savedAt
                                ? 'On. Your picks are kept current.'
                                : 'On, but there is nothing to keep current yet. Back something up once and it will take over from there.'}</span>}
                        </span>
                        <Switch checked={autoOn} labelledBy={autoId} onChange={on => setCloudAutoBackup(on)} />
                    </label>
                )}
                {cs.savedAt && (
                    <div className="st-row st-row-static is-danger">
                        <span className="st-row-text">
                            <span className="st-label">Delete your backup</span>
                            <span className="st-desc">Removes the copy stored on our server. Your collection on this device is untouched.</span>
                        </span>
                        <span className="st-row-control"><button type="button" className="btn btn-danger btn-sm" onClick={() => deleteCloudBackup()}>Delete Backup</button></span>
                    </div>
                )}
            </div>
        </section>
    );
}

// ---- notifications ----

function NotificationsGroup() {
    const prefs = notificationPrefs();
    const paused = prefs?.all === false;
    const pauseId = useId();
    return (
        <>
            <section className="st-group">
                <GroupHead title="Pause notifications" desc="Moderation notices still reach you, whatever you choose here." />
                <div className="st-card">
                    <label className={`st-row${paused ? ' is-on' : ''}`}>
                        <span className="st-row-text">
                            <span className="st-label" id={pauseId}>Pause all notifications</span>
                            <span className="st-desc">Nothing new shows up on the bell until you turn this back off.</span>
                        </span>
                        <Switch checked={paused} labelledBy={pauseId} onChange={on => setNotificationPref('all', !on)} />
                    </label>
                </div>
            </section>
            <section className={`st-group${paused ? ' is-muted' : ''}`}>
                <GroupHead title="Notify me about" />
                <div className="st-card" aria-disabled={paused || undefined}>
                    {prefs === null ? (
                        <div className="st-row st-row-static"><span className="st-row-text"><span className="skel skel-text" style={{ width: '50%' }} /></span></div>
                    ) : NOTIFICATION_KINDS.map(([type, label, desc]) => <NotificationRow key={type} type={type} label={label} desc={desc} on={prefs[type] !== false} disabled={paused} />)}
                </div>
            </section>
            <section className={`st-group${paused ? ' is-muted' : ''}`}>
                <GroupHead title="Email" desc="Sent to the email on your account. Nothing else is ever emailed to you." />
                <div className="st-card" aria-disabled={paused || undefined}>
                    {prefs === null
                        ? <div className="st-row st-row-static"><span className="st-row-text"><span className="skel skel-text" style={{ width: '50%' }} /></span></div>
                        // off unless you turn it on (missing means off, unlike the bell's kinds)
                        : <EmailRow on={prefs.email_event_announcements === true} disabled={paused || prefs.event_announcement === false} />}
                </div>
            </section>
        </>
    );
}

/** Who can mention you, and whether search and suggestions include you (profiles.privacy). */
function PrivacyGroup() {
    const privacy = myPrivacy();
    const mentionsId = useId();
    const discoverId = useId();
    const hidden = privacy?.discover === 'hidden';
    return (
        <section className="st-group">
            <GroupHead title="Mentions & discovery" desc="Who can tag you, and who can come across you." />
            <div className="st-card">
                <div className="st-row st-row-static">
                    <span className="st-row-text">
                        <span className="st-label" id={mentionsId}>Who can mention you</span>
                        <span className="st-desc">An @mention links to your profile and notifies you. Turned off, nobody can tag you and you won&rsquo;t show up when they type @.</span>
                    </span>
                    <span className="st-row-control">
                        <select aria-labelledby={mentionsId} disabled={!privacy} value={privacy?.mentions || 'everyone'} onChange={e => setMyPrivacy('mentions', e.target.value === 'everyone' ? null : e.target.value)}>
                            <option value="everyone">Everyone</option>
                            <option value="following">People I follow</option>
                            <option value="nobody">Nobody</option>
                        </select>
                    </span>
                </div>
                <label className={`st-row${!hidden && privacy ? ' is-on' : ''}`}>
                    <span className="st-row-text">
                        <span className="st-label" id={discoverId}>Show me in search and suggestions</span>
                        <span className="st-desc">Off: you&rsquo;re left out of people search and &ldquo;Creators to follow&rdquo;. People who type your exact @username still find you, and your profile and posts stay as visible as you&rsquo;ve set them.</span>
                    </span>
                    <span className="st-switch">
                        <input type="checkbox" role="switch" checked={!hidden} disabled={!privacy} aria-labelledby={discoverId} onChange={e => setMyPrivacy('discover', e.target.checked ? null : 'hidden')} />
                        <span className="st-switch-track" aria-hidden="true" />
                    </span>
                </label>
            </div>
        </section>
    );
}

function EmailRow({ on, disabled }: { on: boolean; disabled: boolean }) {
    const id = useId();
    const noEmail = !state.user?.hasRealEmail;
    return (
        <label className={`st-row${on && !disabled ? ' is-on' : ''}`}>
            <span className="st-row-text">
                <span className="st-label" id={id}>Email me event announcements</span>
                <span className="st-desc">{noEmail ? 'Add an email to your account first (Account, Edit Profile).' : 'Announcements from events you follow, by email as well as on the bell.'}</span>
            </span>
            <span className="st-switch">
                <input type="checkbox" role="switch" checked={on} disabled={disabled || noEmail} aria-labelledby={id} onChange={e => setNotificationPref('email_event_announcements', e.target.checked)} />
                <span className="st-switch-track" aria-hidden="true" />
            </span>
        </label>
    );
}

function NotificationRow({ type, label, desc, on, disabled }: { type: string; label: string; desc: string; on: boolean; disabled: boolean }) {
    const id = useId();
    return (
        <label className={`st-row${on && !disabled ? ' is-on' : ''}`}>
            <span className="st-row-text">
                <span className="st-label" id={id}>{label}</span>
                <span className="st-desc">{desc}</span>
            </span>
            <span className="st-switch">
                <input type="checkbox" role="switch" checked={on} disabled={disabled} aria-labelledby={id} onChange={e => setNotificationPref(type, e.target.checked)} />
                <span className="st-switch-track" aria-hidden="true" />
            </span>
        </label>
    );
}

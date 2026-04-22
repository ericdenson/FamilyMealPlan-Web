// --- ADMIN PORTAL CONTROLLER ---
// Dedicated script for fetching backend data safely without triggering mobile logic constraints

const db = window.dbClient; // Initialized in supabaseClient.js

const adminState = {
    currentEmployeeId: null,
    dashboardSummary: {},
    usersCount: 0,
    mrr: 0,
    revenues: [],
    recipes: [],
    filteredRecipes: [],
    sides: [],
    filteredSides: [],
    tickets: [],
    globalDiets: [],
    activeRecipeId: null,
    activeUserId: null,
    filteredUsers: [],
    users: [],
    activeTicketId: null,
    employees: [],
    auditLogs: [],
    currentEmployeeId: null, // The currently authenticated Admin interacting with the dashboard
    moderationData: [] // Temporarily cache pending recipes for rapid UI preview modals
};

const DIET_ICONS = {
    'balanced': 'fa-solid fa-scale-balanced',
    'keto': 'fa-solid fa-bacon',
    'mediterranean': 'fa-solid fa-fish',
    'anti_inflammatory': 'fa-solid fa-heart-pulse',
    'high_protein': 'fa-solid fa-dumbbell',
    'vegetarian': 'fa-solid fa-carrot',
    'vegan': 'fa-solid fa-leaf',
    'paleo': 'fa-solid fa-bone',
    'low_sugar': 'fa-solid fa-cubes-stacked',
    'gluten_free': 'fa-solid fa-wheat-awn-circle-exclamation',
    'dairy_free': 'fa-solid fa-cow',
    'low_sodium': `<svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M15 2H9C8.4 2 8 2.4 8 3V4H7V6H17V4H16V3C16 2.4 15.6 2 15 2Z" />
    <path d="M17 7H7V20C7 21.1 7.9 22 9 22H15C16.1 22 17 21.1 17 20V7ZM10.5 10A1.5 1.5 0 1110.5 13A1.5 1.5 0 0110.5 10ZM13.5 15A1.5 1.5 0 1113.5 18A1.5 1.5 0 0113.5 15ZM10.5 17A1.5 1.5 0 1110.5 20A1.5 1.5 0 0110.5 17ZM13.5 10A1.5 1.5 0 1113.5 13A1.5 1.5 0 0113.5 10Z" />
    <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
</svg>`,
    'big_family': 'fa-solid fa-people-roof',
    'budget_friendly': 'fa-solid fa-piggy-bank',
    'im_broke': `<svg viewBox="0 0 100 100" fill="currentColor">
  <!-- Head -->
  <circle cx="50" cy="22" r="10" />
  <!-- Torso -->
  <path d="M42 35 L58 35 L62 58 L38 58 Z" />
  <!-- Legs -->
  <path d="M38 58 L32 90 M62 58 L68 90" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>
  <!-- Arms pulling pockets out -->
  <path d="M42 35 L22 46 L30 65" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"/>
  <path d="M58 35 L78 46 L70 65" stroke="currentColor" stroke-width="5" stroke-linecap="round" fill="none"/>
  <!-- Empty Pockets pulled inside out -->
  <ellipse cx="30" cy="65" rx="8" ry="12" fill="none" stroke="currentColor" stroke-dasharray="2,2" stroke-width="3"/>
  <ellipse cx="70" cy="65" rx="8" ry="12" fill="none" stroke="currentColor" stroke-dasharray="2,2" stroke-width="3"/>
</svg>`,
    'desserts': 'fa-solid fa-ice-cream',
    'snacks': 'fa-solid fa-cookie-bite'
};

const adminApp = {
    async init() {
        console.log("Admin Portal Initialized. Bootstrapping Security Context...");

        // --- 1. THE SECURITY CHECKPOINT ---
        const { data: { session }, error: authError } = await db.auth.getSession();

        if (authError || !session) {
            console.warn("SECURITY_FLAG: User lacks session cookie. Evicting.");
            window.location.href = 'index.html';
            return;
        }

        // --- 2. THE EMPLOYEE VERIFICATION ---
        const { data: adminRecord, error: empError } = await db.from('admin_users')
            .select('*')
            .eq('email', session.user.email)
            .single();

        if (empError || !adminRecord) {
            console.error("SECURITY_FLAG: Valid login, but NOT found in admin_users roster. Bouncing imposter.");
            await db.auth.signOut();
            window.location.href = 'index.html';
            return;
        }

        // Successfully identified this physical desktop employee
        adminState.currentEmployeeId = adminRecord.id;

        // --- 2.5 DYNAMIC HEADER GREETING ---
        const topbarName = document.querySelector('.admin-profile span');
        if (topbarName) {
            let emailName = session.user.email.split('@')[0];
            // Capitalize first letter
            emailName = emailName.charAt(0).toUpperCase() + emailName.slice(1);
            topbarName.innerText = `Welcome ${emailName}!`;
            topbarName.style.marginRight = "12px";
            topbarName.style.fontWeight = "600";
        }

        // --- 3. THE A-LA-CARTE PERMISSION CHECK ---
        const path = window.location.pathname.toLowerCase();
        let currentModule = '';
        if (path.includes('admin-portal')) currentModule = 'dashboard';
        else if (path.includes('admin-revenue')) currentModule = 'revenue';
        else if (path.includes('admin-users')) currentModule = 'users';
        else if (path.includes('admin-recipes')) currentModule = 'recipes';
        else if (path.includes('admin-sides')) currentModule = 'sides';
        else if (path.includes('admin-comms')) currentModule = 'comms';
        else if (path.includes('admin-settings')) currentModule = 'settings';
        else if (path.includes('admin-security')) currentModule = 'security';

        if (currentModule) {
            const modules = adminRecord.accessible_modules || [];
            if (!modules.includes(currentModule)) {
                alert(`Security Policy Violation: Your employee account lacks privilege to access [${currentModule}]. Contact a Super Admin.`);

                // If they don't even have dashboard access, wipe their session completely
                if (!modules.includes('dashboard')) {
                    await db.auth.signOut();
                    window.location.href = 'index.html';
                } else {
                    window.location.href = 'admin-dashboard.html';
                }
                return;
            }
        }

        // --- 4. THE FORCED ONBOARDING INTERCEPT ---
        const { count: passCount, error: auditErr } = await db.from('admin_audit_logs')
            .select('*', { count: 'exact', head: true })
            .eq('admin_id', adminRecord.id)
            .eq('action_type', 'ESTABLISHED_PASSWORD');

        if (!auditErr && passCount === 0) {
            this.showForcedPasswordModal();
            return; // HALT EXECUTION of standard dashboard data pulls
        }

        // --- 5. EXECUTE VIEW RENDERING ---
        console.log(`Access Granted to [${currentModule || 'ROOT'}]. Booting application logic...`);

        // Strip the HTML CSS Cloak
        const authCloak = document.getElementById('auth-cloak');
        if (authCloak) authCloak.remove();

        await this.fetchGlobalDiets();

        const recipesTbody = document.getElementById('admin-recipes-tbody');
        if (recipesTbody) {
            await this.fetchAdminRecipes();
        }

        const sidesTbody = document.getElementById('admin-sides-list');
        if (sidesTbody) {
            await this.fetchAdminSides();
        }

        const usersTbody = document.getElementById('admin-users-list');
        if (usersTbody) {
            await this.fetchAdminUsers();
        }

        const commsTbody = document.getElementById('admin-comms-list');
        if (commsTbody) {
            await this.fetchAdminTickets();
        }

        const auditTbody = document.getElementById('admin-security-logs');
        if (auditTbody) {
            await this.fetchAuditLogs();
            await this.fetchAdminEmployees();
        }

        const mrrStat = document.getElementById('stat-mrr');
        if (mrrStat) {
            await this.computeFinanceData();
        }

        const portalUsersStat = document.getElementById('portal-total-users');
        if (portalUsersStat) {
            await this.computePortalDashboard();
        }

        const totalRecipesStat = document.getElementById('admin-total-recipes');
        if (totalRecipesStat) {
            await this.fetchTotalRecipesCount(totalRecipesStat);
        }

        const modTbody = document.getElementById('admin-moderation-tbody');
        if (modTbody) {
            await this.fetchModerationQueue();
        }

        const cfgWalmart = document.getElementById('cfg-aff-walmart');
        if (cfgWalmart) {
            await this.loadGroceryStoreLinks();
        }

        const cfgPaywall = document.getElementById('cfg-sub-annual');
        if (cfgPaywall) {
            await this.loadSubscriptionPricing();
        }
    },

    // --- GLOBAL AFFILIATE SETTINGS CONTROLLER ---
    async loadGroceryStoreLinks() {
        try {
            const { data, error } = await db.from('global_settings').select('key_value').eq('key_name', 'grocery_affiliates').single();
            if (error && error.code !== 'PGRST116') throw error;
            if (data && data.key_value) {
                const links = data.key_value;
                document.getElementById('cfg-aff-walmart').value = links.walmart || '';
                document.getElementById('cfg-aff-amazon').value = links.amazon || '';
                document.getElementById('cfg-aff-instacart').value = links.instacart || '';
                document.getElementById('cfg-aff-kroger').value = links.kroger || '';
                document.getElementById('cfg-aff-target').value = links.target || '';
            }
        } catch (e) {
            console.warn("Failed to load Grocery Link Set: ", e);
        }
    },

    async saveGroceryStoreLinks() {
        try {
            const payload = {
                walmart: document.getElementById('cfg-aff-walmart').value.trim(),
                amazon: document.getElementById('cfg-aff-amazon').value.trim(),
                instacart: document.getElementById('cfg-aff-instacart').value.trim(),
                kroger: document.getElementById('cfg-aff-kroger').value.trim(),
                target: document.getElementById('cfg-aff-target').value.trim()
            };
            const { error } = await db.from('global_settings').upsert({ key_name: 'grocery_affiliates', key_value: payload });
            if (error) throw error;
            await this.logAdminAudit('Updated Affiliate Links', 'global');
            alert("Affiliate configurations saved globally! Users will see these links immediately upon App reload.");
        } catch (e) {
            console.error(e);
            alert("Failed to save affiliate configs: " + e.message);
        }
    },

    // --- GLOBAL SUBSCRIPTION ENGINE CONTROLLER ---
    async loadSubscriptionPricing() {
        try {
            const { data, error } = await db.from('global_settings').select('key_value').eq('key_name', 'subscription_pricing').single();
            if (error && error.code !== 'PGRST116') throw error;
            if (data && data.key_value) {
                const p = data.key_value;
                if(p.monthly_tiers && p.monthly_tiers.length >= 3) {
                    document.getElementById('cfg-sub-month-1').value = p.monthly_tiers[0] || '';
                    document.getElementById('cfg-sub-month-2').value = p.monthly_tiers[1] || '';
                    document.getElementById('cfg-sub-month-3').value = p.monthly_tiers[2] || '';
                }
                document.getElementById('cfg-sub-annual').value = p.yearly_price || '';
            }
        } catch (e) {
            console.warn("Failed to load Subscription engine: ", e);
        }
    },

    async saveSubscriptionPricing() {
        try {
            const m1 = parseFloat(document.getElementById('cfg-sub-month-1').value) || 5.99;
            const m2 = parseFloat(document.getElementById('cfg-sub-month-2').value) || 8.99;
            const m3 = parseFloat(document.getElementById('cfg-sub-month-3').value) || 11.99;
            const yr = parseFloat(document.getElementById('cfg-sub-annual').value) || 79.99;

            const payload = {
                monthly_tiers: [m1, m2, m3],
                yearly_price: yr
            };
            
            const { error } = await db.from('global_settings').upsert({ key_name: 'subscription_pricing', key_value: payload });
            if (error) throw error;
            
            await this.logAdminAudit('Updated Paywall Pricing', 'global');
            alert("Subscription Pricing synchronized successfully! The app completely decoupled and will parse this natively on boot.");
        } catch (e) {
            console.error(e);
            alert("Failed to save Subscription Pricing configs: " + e.message);
        }
    },

    async logAdminAudit(actionType, targetId = 'global') {
        try {
            if (!adminState.currentEmployeeId) return; // Silent abort if tracking lost
            await db.from('admin_audit_logs').insert([{
                admin_id: adminState.currentEmployeeId,
                action_type: actionType,
                target_entity_id: targetId.toString()
            }]);
        } catch (e) {
            console.warn("Audit Log write failed: ", e);
        }
    },

    async fetchAuditLogs() {
        try {
            const tbody = document.getElementById('admin-security-logs');
            if (!tbody) return;

            const { data, error } = await db.from('admin_audit_logs')
                .select(`
                    id, action_type, target_entity_id, timestamp,
                    admin_users ( email, role )
                `)
                .order('timestamp', { ascending: false })
                .limit(150);

            if (error) throw error;

            if (!data || data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color: #888;">No system audit logs found.</td></tr>';
                return;
            }

            adminState.auditLogs = data;

            tbody.innerHTML = data.map(log => {
                const dateRaw = new Date(log.timestamp);
                const ds = dateRaw.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
                const empEmail = log.admin_users ? log.admin_users.email : 'System Matrix';
                const role = log.admin_users ? log.admin_users.role : 'Core';

                return `
                <tr>
                    <td style="color: #666; font-size: 0.7rem;">${ds}</td>
                    <td><div style="font-weight: 600;">${empEmail}</div><div style="font-size: 0.65rem; color:#aaa; margin-top:2px;">[${role.toUpperCase()}]</div></td>
                    <td><span class="audit-tag" style="background:#f4f6f8; color:#333;">${log.action_type}</span></td>
                    <td style="color:#aaa;">${log.target_entity_id || 'System-Wide'}</td>
                </tr>
                `;
            }).join('');
        } catch (e) {
            console.error("Failed to fetch audit logs:", e);
        }
    },

    async fetchTotalRecipesCount(element) {
        try {
            const { count, error } = await db
                .from('recipes')
                .select('*', { count: 'exact', head: true });

            if (error) throw error;
            element.innerText = count || 0;
        } catch (e) {
            console.error("Admin: Failed to grab recipe count.", e);
        }
    },

    async fetchModerationQueue() {
        try {
            const tbody = document.getElementById('admin-moderation-tbody');
            if (!tbody) return;

            const { data, error } = await db.from('recipes')
                .select('id, title, author_id, visibility, instructions, recipe_ingredients(ingredient_name), users!recipes_author_id_fkey(first_name)')
                .eq('visibility', 'pending_approval');

            if (error) throw error;

            if (!data || data.length === 0) {
                tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 32px;">No incoming recipes awaiting review.</td></tr>`;
                return;
            }

            // Cache locally so we don't have to re-fetch when clicking [Preview]
            adminState.moderationData = data;

            tbody.innerHTML = data.map(r => {
                const authorName = r.users ? r.users.first_name : r.author_id.substring(0, 8);
                return `
                <tr>
                    <td style="font-weight: 600;">${r.title}</td>
                    <td style="font-size: 0.9rem; color: #555;">${authorName}</td>
                    <td><span class="status-badge pending">Pending</span></td>
                    <td>
                        <button class="btn" style="background:#0054a4; padding: 6px 12px; font-size: 0.8rem;" onclick="adminApp.previewModerationRecipe('${r.id}')"><i class="fa-solid fa-eye"></i> Review Submission</button>
                    </td>
                </tr>
                `;
            }).join('');

        } catch (e) {
            console.error("Failed to fetch Moderation Queue:", e);
        }
    },

    previewModerationRecipe(recipeId) {
        const recipe = adminState.moderationData.find(r => r.id === recipeId);
        if (!recipe) return;

        const dialog = document.createElement('dialog');
        dialog.style.padding = '32px';
        dialog.style.borderRadius = '16px';
        dialog.style.border = 'none';
        dialog.style.boxShadow = '0 10px 40px rgba(0,0,0,0.15)';
        dialog.style.width = '700px';
        dialog.style.maxWidth = '90vw';
        dialog.style.fontFamily = "'Outfit', sans-serif";

        const ingsList = (recipe.recipe_ingredients || []).map(i => `<li style="margin-bottom:6px;">${i.ingredient_name}</li>`).join('');
        const safeTitle = recipe.title.replace(/'/g, "&apos;");
        const authorName = recipe.users ? recipe.users.first_name : recipe.author_id.substring(0, 8);

        dialog.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom: 24px;">
                <div>
                  <h2 style="font-size: 1.8rem; margin:0 0 4px 0; color:var(--text-main); font-weight:700;">${recipe.title}</h2>
                  <p style="margin:0; font-size:0.9rem; color:#888;">Submitted by: <strong style="color:#333;">${authorName}</strong></p>
                </div>
                <button onclick="this.closest('dialog').close(); this.closest('dialog').remove();" style="background:none; border:none; color:#888; font-size:1.5rem; cursor:pointer;"><i class="fa-solid fa-xmark"></i></button>
            </div>
            
            <div style="overflow-y:auto; max-height: 50vh; padding-right: 16px; margin-bottom: 24px;">
                <h4 style="color:var(--accent-color); font-size:0.9rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">Ingredient Breakdown</h4>
                <ul style="color:#555; padding-left: 20px; font-size:1.05rem; margin-bottom: 32px;">${ingsList || '<li>No ingredients found.</li>'}</ul>
                
                <h4 style="color:var(--accent-color); font-size:0.9rem; text-transform:uppercase; letter-spacing:1px; margin-bottom:12px;">Extracted Instructions</h4>
                <p style="white-space:pre-wrap; color:#555; font-size:1.05rem; line-height: 1.6;">${recipe.instructions || 'No instructions found.'}</p>
            </div>

            <div style="margin-bottom: 20px;">
                <label style="display:block; font-size:0.85rem; font-weight:700; color:#555; margin-bottom:8px; text-transform:uppercase;">Inbox Message to Creator (Optional)</label>
                <textarea id="mod-message" rows="3" placeholder="Type a message to send directly to their notification tray..." style="width:100%; border-radius:12px; border:1px solid #ddd; padding:12px; font-family:inherit; font-size:0.95rem; resize:none;"></textarea>
            </div>
            
            <div style="display:flex; gap:16px; justify-content:flex-end; border-top:1px solid #eee; padding-top:24px;">
                <button class="btn" style="background:#6b8b72; padding: 12px 24px; font-size: 1rem;" onclick="adminApp.executeModerationApprove('${recipe.id}', '${recipe.author_id}', '${safeTitle}', document.getElementById('mod-message').value); this.closest('dialog').close(); this.closest('dialog').remove();"><i class="fa-solid fa-check"></i> Approve & Publish</button>
                <button class="btn" style="background:#e57373; padding: 12px 24px; font-size: 1rem;" onclick="adminApp.executeModerationReject('${recipe.id}', '${recipe.author_id}', '${safeTitle}', document.getElementById('mod-message').value); this.closest('dialog').close(); this.closest('dialog').remove();"><i class="fa-solid fa-xmark"></i> Reject Submission</button>
            </div>
        `;

        // Add native backdrop styling through a quick style block injection
        const style = document.createElement('style');
        style.innerHTML = `dialog::backdrop { background: rgba(0,0,0,0.5); backdrop-filter: blur(2px); }`;
        dialog.appendChild(style);

        document.body.appendChild(dialog);
        dialog.showModal();
    },

    async executeModerationApprove(recipeId, authorId, safeTitle, rawMessage) {
        const bodyContent = rawMessage ? rawMessage : `Great news! Your recipe for "${safeTitle}" has been reviewed and approved. It's now live and available in the global community cookbook!`;
        try {
            const { error: updateError } = await db.from('recipes').update({ visibility: 'public' }).eq('id', recipeId);
            if (updateError) throw updateError;

            const { error: insertError } = await db.from('inbox_messages').insert([{
                user_id: authorId,
                type: 'approval',
                title: 'Recipe Published! 🎉',
                body: bodyContent
            }]);
            if (insertError) throw insertError;

            await this.logAdminAudit('Approved Moderation Queue Recipe', recipeId);
            alert("Recipe Approved & Pushed Globally!");
            await this.fetchModerationQueue();
        } catch (e) {
            console.error("Failed to approve recipe:", e);
            alert("Execution array failure during database write: " + e.message);
        }
    },

    async executeModerationReject(recipeId, authorId, title, rawMessage) {
        const bodyContent = rawMessage ? rawMessage : 'Unfortunately, your recipe submission did not meet community formatting guidelines and was returned to your private cookbook. Feel free to edit and resubmit!';
        try {
            const { error: updateError } = await db.from('recipes').update({ visibility: 'private' }).eq('id', recipeId);
            if (updateError) throw updateError;

            // 1. Spawn an interactive support ticket
            const { data: ticketData, error: ticketError } = await db.from('support_tickets').insert([{
                user_id: authorId,
                subject_tag: 'RECIPE',
                status: 'open'
            }]).select().single();
            if (ticketError) throw ticketError;

            // 2. Embed initial rejection message
            const { error: msgErr } = await db.from('support_messages').insert([{
                ticket_id: ticketData.id,
                sender_type: 'admin',
                message_body: `[System Action: Recipe Sent Back for Revisions]\n${title}\n\n${bodyContent}`
            }]);
            if (msgErr) throw msgErr;

            // 3. Notify their phone natively
            await db.from('inbox_messages').insert([{
                user_id: authorId,
                type: 'support_reply',
                title: 'Recipe Sent Back: ' + title,
                body: bodyContent,
                ticket_id: ticketData.id
            }]);

            await this.logAdminAudit('Rejected Moderation Queue Recipe', recipeId);
            alert("Recipe Rejected & Thread Opened in Communications Hub!");
            await this.fetchModerationQueue();
        } catch (e) {
            console.error("Failed to reject recipe:", e);
            alert("Execution array failure during database write: " + e.message);
        }
    },

    async fetchAdminSides() {
        try {
            const tbody = document.getElementById('admin-sides-list');
            if (!tbody) return;

            const { data, error } = await db.from('global_side_dishes').select('*').order('name', { ascending: true });
            if (error) throw error;

            adminState.sides = data || [];

            // Search Filtering
            const term = document.getElementById('admin-sides-search')?.value.toLowerCase() || '';
            const filteredSides = adminState.sides.filter(s => s.name.toLowerCase().includes(term) || (s.calories && s.calories.toString().includes(term)));

            if (filteredSides.length === 0) {
                tbody.innerHTML = '<tr><td colspan="4" style="padding: 40px; text-align: center; color: var(--text-muted);">No global side dishes found.</td></tr>';
                return;
            }

            tbody.innerHTML = filteredSides.map(s => `
                <tr style="${!s.is_active ? 'opacity: 0.5;' : ''}">
                    <td style="font-weight: 600;">${s.name}</td>
                    <td>${s.calories || '0'}</td>
                    <td><span style="display:inline-block; padding: 4px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; background: ${s.is_active ? '#eef4ef' : '#eee'}; color: ${s.is_active ? '#43a047' : '#888'};">${s.is_active ? 'Active' : 'Archived'}</span></td>
                    <td>
                        <i class="fa-solid fa-box-archive action-icon" onclick="adminApp.toggleSideStatus('${s.id}', ${s.is_active})" title="${s.is_active ? 'Archive globally' : 'Restore globally'}"></i>
                    </td>
                </tr>
            `).join('');

        } catch (e) {
            console.error(e);
        }
    },

    applySideFilters() {
        this.fetchAdminSides();
    },

    addNewSideRow() {
        const tbody = document.getElementById('admin-sides-list');
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="text" id="new-side-name" class="edit-input" style="width: 100%;" placeholder="e.g. Mashed Potatoes"></td>
            <td><input type="number" id="new-side-cal" class="edit-input" style="width: 80px;" placeholder="Cal"></td>
            <td><span style="display:inline-block; padding: 4px 10px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; background:#fff3e0; color:#fb8c00;">New</span></td>
            <td>
                <button class="btn" style="padding: 6px 12px; font-size: 0.8rem;" onclick="adminApp.saveSide(this)">Save</button>
            </td>
        `;
        tbody.insertBefore(tr, tbody.firstChild);
    },

    async saveSide(btnContainer) {
        const nameVal = document.getElementById('new-side-name').value.trim();
        const calVal = document.getElementById('new-side-cal').value;

        if (!nameVal) return alert("Side dish must have a name.");

        btnContainer.innerText = "Saving...";
        btnContainer.style.pointerEvents = "none";

        try {
            const { error } = await db.from('global_side_dishes').insert([{
                name: nameVal,
                calories: parseInt(calVal) || 0,
                is_active: true
            }]);

            if (error) throw error;

            await this.logAdminAudit('Created New Side Dish', nameVal);
            await this.fetchAdminSides();
        } catch (e) {
            alert("Error saving side dish: " + e.message);
            btnContainer.innerText = "Save";
            btnContainer.style.pointerEvents = "all";
        }
    },

    async toggleSideStatus(id, currentActive) {
        if (!confirm(`Are you sure you want to ${currentActive ? 'archive' : 'restore'} this side dish globally?`)) return;
        try {
            const { error } = await db.from('global_side_dishes').update({ is_active: !currentActive }).eq('id', id);
            if (error) throw error;

            await this.logAdminAudit(!currentActive ? 'Restored Side Dish' : 'Archived Side Dish', id);
            await this.fetchAdminSides();
        } catch (e) {
            alert("Error changing side dish status: " + e.message);
        }
    },

    async fetchAdminRecipes() {
        try {
            console.log("Admin: Fetching cloud recipes...");

            const { data: rawRecipes, error: recError } = await db
                .from('recipes')
                .select(`
                    id,
                    title,
                    meal_type,
                    prep_time_minutes,
                    calories_per_serving,
                    image_url,
                    instructions,
                    community_rating_average,
                    is_archived,
                    visibility,
                    author_id,
                    affiliate_links,
                    users!recipes_author_id_fkey(email),
                    recipe_tags ( diet_id ),
                    recipe_ingredients ( ingredient_name, shopping_category )
                `)
                .order('title', { ascending: true }); // Alphabetical for table UI

            if (recError) throw recError;

            // Fetch live scheduled counts from the active current_weekly_plan
            const { data: schedulesData } = await db.from('current_weekly_plan').select('recipe_id');
            const scheduleCounts = {};
            if (schedulesData) {
                schedulesData.forEach(row => {
                    const rId = row.recipe_id;
                    if (!scheduleCounts[rId]) scheduleCounts[rId] = 0;
                    scheduleCounts[rId]++;
                });
            }

            adminState.recipes = rawRecipes.map(r => {
                const diets = r.recipe_tags.map(t => t.diet_id);
                return {
                    id: r.id,
                    title: r.title,
                    type: r.meal_type,
                    time: r.prep_time_minutes || 0,
                    calories: r.calories_per_serving || 0,
                    diet: diets,
                    ingredients: r.recipe_ingredients,
                    rating: r.community_rating_average || 0,
                    image: r.image_url,
                    instructions: r.instructions,
                    is_archived: r.is_archived || false,
                    visibility: r.visibility || 'public',
                    affiliateLinks: r.affiliate_links || [],
                    authorEmail: r.users ? r.users.email : null,
                    scheduledReal: scheduleCounts[r.id] || 0, // Real metrics sourced from active users
                    lifetimeMock: Math.floor(Math.random() * 500) + 12 // Keeps the layout from breaking until past_plans is mapped
                };
            });

            console.log("Admin: Successfully loaded " + adminState.recipes.length + " recipes.");
            this.applyFilters();

        } catch (e) {
            console.error("Admin: Failed pulling from Supabase:", e);
        }
    },

    applyFilters() {
        const searchInput = document.getElementById('filter-search');
        const dietInput = document.getElementById('filter-diet');
        const statusInput = document.getElementById('filter-status');

        if (!searchInput || !dietInput || !statusInput) return;

        const sQ = searchInput.value.toLowerCase();
        const dQ = dietInput.value;
        const stQ = statusInput.value;

        // Perform memory filter 
        adminState.filteredRecipes = adminState.recipes.filter(r => {
            // 1. Text Search across Title, ID, or any ingredient names
            const matchSearch = r.title.toLowerCase().includes(sQ) ||
                r.id.toLowerCase().includes(sQ) ||
                r.ingredients.some(i => i.ingredient_name.toLowerCase().includes(sQ));
            if (!matchSearch) return false;

            // 2. Diet Constraint
            if (dQ && !r.diet.includes(dQ)) return false;

            // 3. Status Rule
            if (r.is_archived && stQ !== 'archived') return false;
            if (!r.is_archived && stQ === 'archived') return false;
            if (stQ === 'live_global' && r.visibility !== 'public') return false;
            if (stQ === 'live_private' && r.visibility !== 'private') return false;

            return true;
        });

        this.renderAdminRecipeTable();

        // Auto-select first element from the sorted results array
        if (adminState.filteredRecipes.length > 0) {
            this.openRecipeEditor(adminState.filteredRecipes[0].id);
        } else {
            this.createNewRecipe(); // blank out details pane
        }
    },

    renderAdminRecipeTable() {
        const tbody = document.getElementById('admin-recipes-tbody');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (adminState.filteredRecipes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px; color:var(--text-muted);">No matching recipes found based on your filters.</td></tr>';
            return;
        }

        adminState.filteredRecipes.forEach((recipe, index) => {
            let badgeBg = '#f4ecf0';
            let badgeColor = '#b6758f';
            const primaryDiet = recipe.diet[0] || 'balanced';

            if (primaryDiet.toLowerCase().includes('keto') || primaryDiet.toLowerCase().includes('paleo')) {
                badgeBg = '#eef4ef'; badgeColor = '#6b8b72';
            } else if (primaryDiet.toLowerCase().includes('veg')) {
                badgeBg = '#fff3e0'; badgeColor = '#ef6c00';
            } else if (primaryDiet.toLowerCase().includes('broke') || primaryDiet.toLowerCase().includes('family')) {
                badgeBg = '#e3f2fd'; badgeColor = '#1976d2';
            }

            const formatDietStr = (code) => {
                const map = {
                    'imBroke': 'Budget Friendly',
                    'bigFamily': 'Big Family',
                    'keto': 'Keto',
                    'vegan': 'Vegan',
                    'vegetarian': 'Vegetarian',
                    'paleo': 'Paleo',
                    'mediterranean': 'Mediterranean',
                    'balanced': 'Balanced'
                };
                return map[code] || (code.charAt(0).toUpperCase() + code.slice(1));
            };

            const dietDisplay = recipe.diet.length > 0
                ? recipe.diet.map(d => formatDietStr(d)).join(' / ')
                : 'Balanced';

            const tr = document.createElement('tr');
            tr.dataset.id = recipe.id; // Map Row to internal ID for Selection Hook

            tr.innerHTML = `
                <td>
                    <div class="recipe-thumb">
                        <img src="${recipe.image || 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=200&q=80'}" alt="${recipe.title}">
                        <div>
                            <span class="recipe-title ${recipe.is_archived ? 'archived-text' : ''}">${recipe.title} ${recipe.is_archived ? '(Archived)' : ''}</span>
                            <span class="recipe-meta">ID: ${recipe.id.split('-')[0]}... &nbsp;•&nbsp; ${recipe.ingredients.length} Ingredients &nbsp;•&nbsp; ${recipe.time} mins ${recipe.visibility === 'private' && recipe.authorEmail ? `&nbsp;•&nbsp; <i class="fa-solid fa-lock"></i> Private: ${recipe.authorEmail}` : ''}</span>
                        </div>
                    </div>
                </td>
                <td><span class="diet-badge" style="background:${badgeBg}; color:${badgeColor};">${dietDisplay}</span></td>
                <td><span class="stat-badge"><i class="fa-solid fa-star" style="color:#ffb4a2;"></i> ${recipe.rating || '--'}</span></td>
                <td><span class="stat-badge" style="color:var(--accent-color);"><i class="fa-solid fa-chart-line"></i> ${recipe.scheduledReal.toLocaleString()} Users</span></td>
            `;

            tr.onclick = () => this.openRecipeEditor(recipe.id);
            tr.style.cursor = "pointer";
            if (recipe.is_archived) tr.style.opacity = "0.6";

            tbody.appendChild(tr);
        });
    },

    openRecipeEditor(id) {
        if (document.getElementById('affiliate-editor-container')) {
            return this.openAffiliateEditor(id);
        }

        document.getElementById('editor-pane-title').innerText = "Edit Recipe";
        adminState.activeRecipeId = id;
        const recipe = adminState.recipes.find(r => r.id === id);
        if (!recipe) return;

        // Visual Table Select
        document.querySelectorAll('#admin-recipes-tbody tr').forEach(tr => {
            tr.classList.remove('active-row');
            if (tr.dataset.id === id) tr.classList.add('active-row');
        });
        // Hydrate Editor Fields
        if(document.getElementById('edit-image-prompt')) document.getElementById('edit-image-prompt').value = "";
        document.getElementById('edit-title').value = recipe.title;
        document.getElementById('edit-type').value = recipe.type || "dinner";
        document.getElementById('edit-calories').value = recipe.calories;
        document.getElementById('edit-rating').value = recipe.rating;
        document.getElementById('edit-time').value = recipe.time;
        document.getElementById('edit-instructions').value = recipe.instructions || '';
        document.getElementById('edit-preview-img').src = recipe.image || 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?auto=format&fit=crop&w=600&q=80';

        // Hydrate Editor KPI Blocks
        const rEl = document.getElementById('edit-rating-count');
        const sEl = document.getElementById('edit-sched-count');
        const lEl = document.getElementById('edit-lifetime-count');
        if (rEl) rEl.innerText = recipe.rating || '--';
        if (sEl) sEl.innerText = recipe.scheduledReal.toLocaleString();
        if (lEl) lEl.innerText = recipe.lifetimeMock.toLocaleString();
        document.getElementById('edit-archived').checked = recipe.is_archived;
        document.getElementById('edit-image-url').value = recipe.image || "";

        // Hydrate Multi-Select Diets
        const dietSelect = document.getElementById('edit-diets');
        for (let i = 0; i < dietSelect.options.length; i++) {
            dietSelect.options[i].selected = recipe.diet.includes(dietSelect.options[i].value);
        }

        // Hydrate Ingredients Dynamic List
        const igList = document.getElementById('edit-ingredients-list');
        igList.innerHTML = '';
        recipe.ingredients.forEach(ig => this.addIngredientRow(ig.ingredient_name, ig.shopping_category));
    },

    createNewRecipe() {
        if (document.getElementById('affiliate-editor-container')) return; // Disabled on affiliate view
        
        document.getElementById('editor-pane-title').innerText = "Create New Draft";
        adminState.activeRecipeId = null;

        document.querySelectorAll('#admin-recipes-tbody tr').forEach(tr => tr.classList.remove('active-row'));

        if(document.getElementById('edit-image-prompt')) document.getElementById('edit-image-prompt').value = "";
        document.getElementById('edit-title').value = "";
        document.getElementById('edit-type').value = "dinner";
        document.getElementById('edit-time').value = "30";
        document.getElementById('edit-calories').value = "400";
        document.getElementById('edit-rating').value = "0.0";
        document.getElementById('edit-archived').checked = false;
        document.getElementById('edit-image-url').value = "";
        document.getElementById('edit-preview-img').src = 'https://via.placeholder.com/600x300?text=Paste+Image+URL';
        document.getElementById('edit-instructions').value = "";

        const dietSelect = document.getElementById('edit-diets');
        for (let i = 0; i < dietSelect.options.length; i++) {
            dietSelect.options[i].selected = false;
        }

        document.getElementById('edit-ingredients-list').innerHTML = '';
        this.addIngredientRow('', 'Pantry & Dry Goods'); // Give them 1 empty row to start
    },



    addIngredientRow(name = "", category = "Pantry & Dry Goods") {
        const div = document.createElement('div');
        div.style.display = "flex";
        div.style.gap = "8px";
        div.innerHTML = `
            <input type="text" class="ig-name" value="${typeof name === 'string' ? name.replace(/"/g, '&quot;') : ''}" placeholder="e.g. 2 cups Rice" style="flex: 1; padding: 10px; border: 1px solid var(--border-light); border-radius: 6px;">
            <button onclick="this.parentElement.remove()" style="background:transparent; border:none; color:var(--danger-color); cursor:pointer; padding:0 8px;"><i class="fa-solid fa-xmark"></i></button>
        `;
        document.getElementById('edit-ingredients-list').appendChild(div);
    },

    async saveRecipe() {
        const title = document.getElementById('edit-title').value;
        if (!title) return alert("Recipe Title is required!");

        const btn = document.querySelector('.btn-save');
        btn.innerText = "Syncing...";
        btn.disabled = true;

        try {
            const is_archived = document.getElementById('edit-archived').checked;
            const meal_type = document.getElementById('edit-type').value;
            const prep_time_minutes = parseInt(document.getElementById('edit-time').value) || 0;
            const calories_per_serving = parseInt(document.getElementById('edit-calories').value) || 0;
            let community_rating_average = parseFloat(document.getElementById('edit-rating').value) || 0;
            if (community_rating_average > 5.0) community_rating_average = 5.0;
            if (community_rating_average < 0) community_rating_average = 0;
            const image_url = document.getElementById('edit-image-url').value;
            const instructions = document.getElementById('edit-instructions').value;

            // Grab multi-select Diets array
            const dietSelect = document.getElementById('edit-diets');
            const selectedDiets = Array.from(dietSelect.selectedOptions).map(o => o.value);

            // Scrape Dynamic Ingredient Rows
            const igRows = document.querySelectorAll('#edit-ingredients-list > div');
            const finalIngredients = [];
            igRows.forEach(row => {
                const n = row.querySelector('.ig-name').value.trim();
                // The Postgres DB has a strict CHECK constraint, so we MUST insert a valid enum value like 'Pantry & Dry Goods'
                if (n) finalIngredients.push({ ingredient_name: n, shopping_category: 'Pantry & Dry Goods' });
            });

            const rowData = {
                title,
                meal_type,
                prep_time_minutes,
                calories_per_serving,
                community_rating_average,
                image_url,
                instructions,
                is_archived
            };

            let targetId = adminState.activeRecipeId;

            // Step 1: Upsert Core Recipe Row (Since we didn't specify author_id, it is implicitly a System Recipe)
            if (targetId) {
                const { error } = await db.from('recipes').update(rowData).eq('id', targetId);
                if (error) throw error;
                // Delete old mappings prior to bulk rewrite (Standard many-to-many reset approach)
                const { error: errDel1 } = await db.from('recipe_tags').delete().eq('recipe_id', targetId);
                if (errDel1) throw errDel1;
                const { error: errDel2 } = await db.from('recipe_ingredients').delete().eq('recipe_id', targetId);
                if (errDel2) throw errDel2;
            } else {
                const { data, error } = await db.from('recipes').insert([rowData]).select().single();
                if (error) throw error;
                targetId = data.id;
            }

            // Step 2: Bulk Relational Inserts
            if (selectedDiets.length > 0) {
                const dietRows = selectedDiets.map(d => ({ recipe_id: targetId, diet_id: d }));
                const { error: insErr1 } = await db.from('recipe_tags').insert(dietRows);
                if (insErr1) throw insErr1;
            }
            if (finalIngredients.length > 0) {
                const igRowsInsert = finalIngredients.map(ig => ({
                    recipe_id: targetId,
                    ingredient_name: ig.ingredient_name,
                    shopping_category: ig.shopping_category
                }));
                const { error: insErr2 } = await db.from('recipe_ingredients').insert(igRowsInsert);
                if (insErr2) throw insErr2;
            }

            console.log("Admin: Success Syncing to Supabase");
            await this.fetchAdminRecipes(); // Automatically updates UI and filtering map

            // Refocus UI to newly saved row
            this.openRecipeEditor(targetId);

        } catch (e) {
            console.error(e);
            alert("Error saving properties: " + e.message);
        } finally {
            btn.innerText = "Save Changes";
            btn.disabled = false;
        }
    },

    async archiveRecipe() {
        if (!adminState.activeRecipeId) return alert("Select an Active Recipe first!");

        // Safety lock dialogue
        if (!confirm("Are you sure you want to flag this recipe as Archived? It will be hidden from consumer searches immediately.")) return;

        try {
            const { error } = await db.from('recipes')
                .update({ is_archived: true })
                .eq('id', adminState.activeRecipeId);

            if (error) throw error;

            await this.fetchAdminRecipes(); // Resyncs
        } catch (e) {
            alert("Archive Error: " + e.message);
        }
    }, // END RECIPES

    // ===================================
    // AFFILIATE MONETIZATION ENGINE
    // ===================================
    
    openAffiliateEditor(id) {
        adminState.activeRecipeId = id;
        const recipe = adminState.recipes.find(r => r.id === id);
        if (!recipe) return;

        // Visual Table Select
        document.querySelectorAll('#admin-recipes-tbody tr').forEach(tr => {
            tr.classList.remove('active-row');
            if (tr.dataset.id === id) tr.classList.add('active-row');
        });

        document.getElementById('editor-pane-title').innerText = "Monetizing: " + recipe.title;
        document.getElementById('affiliate-empty-state').style.display = 'none';
        document.getElementById('affiliate-editor-container').style.display = 'flex';
        document.getElementById('edit-affiliate-recipe-id').value = id;

        this.renderAffiliateSections(recipe.affiliateLinks || []);
    },

    renderAffiliateSections(affiliateLinksArray) {
        const wrapper = document.getElementById('affiliate-sections-wrapper');
        wrapper.innerHTML = '';
        
        affiliateLinksArray.forEach((section, sIdx) => {
            const sectionDiv = document.createElement('div');
            sectionDiv.className = 'affiliate-section';
            sectionDiv.style = "background: #fff; border: 1px solid #e1e4e8; padding: 20px; border-radius: 12px;";
            
            let linksHtml = '';
            (section.links || []).forEach((link, lIdx) => {
                linksHtml += `
                    <div class="affiliate-link-row" style="display:flex; gap:12px; margin-bottom:12px; align-items:center;">
                        <i class="fa-solid fa-link" style="color:var(--text-muted);"></i>
                        <input type="text" class="link-label" value="${link.label.replace(/"/g, '&quot;')}" placeholder="Button Text (e.g. Avocado Oil)" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:6px;">
                        <input type="text" class="link-url" value="${link.url.replace(/"/g, '&quot;')}" placeholder="URL (e.g. https://goto.walmart...)" style="flex:2; padding:8px; border:1px solid #ccc; border-radius:6px;">
                        <i class="fa-solid fa-trash action-icon" style="color: #ef5350; cursor:pointer;" title="Remove Link" onclick="this.parentElement.remove()"></i>
                    </div>
                `;
            });

            sectionDiv.innerHTML = `
                <div style="display:flex; justify-content:space-between; margin-bottom:16px;">
                    <input type="text" class="section-title" value="${section.sectionTitle.replace(/"/g, '&quot;')}" placeholder="Section Title (e.g. Required Kitchen Tools)" style="font-size:1.1rem; font-weight:700; border:none; border-bottom:2px solid var(--accent-color); padding-bottom:4px; outline:none; width:60%;">
                    <div>
                        <button class="btn" style="background:var(--bg-color); color:var(--text-main); font-size:0.8rem; padding:6px 12px; margin-right:8px;" onclick="adminApp.addAffiliateLink(this)"><i class="fa-solid fa-plus"></i> Add Link</button>
                        <button class="btn" style="background:#ffebee; color:#d32f2f; font-size:0.8rem; padding:6px 12px;" onclick="this.closest('.affiliate-section').remove()"><i class="fa-solid fa-trash-can"></i> Delete Section</button>
                    </div>
                </div>
                <div class="links-wrapper" style="margin-top:20px;">
                    ${linksHtml}
                </div>
            `;
            wrapper.appendChild(sectionDiv);
        });
    },

    addAffiliateSection() {
        const wrapper = document.getElementById('affiliate-sections-wrapper');
        const emptySection = { sectionTitle: "New Recommendation Section", links: [ {label: "", url: ""} ] };
        
        // Temporarily scrape existing to append cleanly
        const currentData = this.scrapeAffiliateData();
        currentData.push(emptySection);
        this.renderAffiliateSections(currentData);
    },

    addAffiliateLink(btn) {
        const wrapper = btn.closest('.affiliate-section').querySelector('.links-wrapper');
        const div = document.createElement('div');
        div.className = 'affiliate-link-row';
        div.style = "display:flex; gap:12px; margin-bottom:12px; align-items:center;";
        div.innerHTML = `
            <i class="fa-solid fa-link" style="color:var(--text-muted);"></i>
            <input type="text" class="link-label" placeholder="Button Text (e.g. Avocado Oil)" style="flex:1; padding:8px; border:1px solid #ccc; border-radius:6px;">
            <input type="text" class="link-url" placeholder="URL (e.g. https://goto.walmart...)" style="flex:2; padding:8px; border:1px solid #ccc; border-radius:6px;">
            <i class="fa-solid fa-trash action-icon" style="color: #ef5350; cursor:pointer;" title="Remove Link" onclick="this.parentElement.remove()"></i>
        `;
        wrapper.appendChild(div);
    },

    scrapeAffiliateData() {
        const sections = [];
        document.querySelectorAll('.affiliate-section').forEach(secNode => {
            const sectionTitle = secNode.querySelector('.section-title').value.trim();
            if (!sectionTitle) return;
            
            const links = [];
            secNode.querySelectorAll('.affiliate-link-row').forEach(rowNode => {
                const label = rowNode.querySelector('.link-label').value.trim();
                const url = rowNode.querySelector('.link-url').value.trim();
                if (label && url) {
                    links.push({ label, url });
                }
            });
            sections.push({ sectionTitle, links });
        });
        return sections;
    },

    async saveAffiliates() {
        const targetId = document.getElementById('edit-affiliate-recipe-id').value;
        if (!targetId) return alert("No recipe selected!");

        const btn = document.querySelector('.btn-save');
        btn.innerText = "Saving Configuration...";
        btn.disabled = true;

        const payload = this.scrapeAffiliateData();

        try {
            const { error } = await db.from('recipes')
                .update({ affiliate_links: payload })
                .eq('id', targetId);

            if (error) throw error;
            
            await this.logAdminAudit('Updated Affiliate Links', targetId);
            
            // Sync Local Map silently
            const memRec = adminState.recipes.find(r => r.id === targetId);
            if (memRec) memRec.affiliateLinks = payload;
            
            alert("Affiliates perfectly synced to App!");
        } catch(e) {
            alert("Affiliate Save Failed: " + e.message);
        } finally {
            btn.innerText = "Save Affiliate Configuration";
            btn.disabled = false;
        }
    },

    async clearAllAffiliates() {
        if(!confirm("Are you absolutely sure you want to nuke all monetization links on this recipe?")) return;
        document.getElementById('affiliate-sections-wrapper').innerHTML = '';
        await this.saveAffiliates();
    },

    // ===================================
    // GLOBAL SIDE DISHES SYSTEM
    // ===================================

    async fetchAdminSides() {
        try {
            console.log("Admin: Fetching global sides...");
            const { data, error } = await db.from('global_side_dishes').select('*').order('name', { ascending: true });
            if (error) throw error;

            adminState.sides = data || [];
            this.applySideFilters();
        } catch (e) {
            console.error("Admin: Failed pulling sides", e);
        }
    },

    applySideFilters() {
        const searchInput = document.getElementById('admin-sides-search');
        if (!searchInput) return;

        const sQ = searchInput.value.toLowerCase();

        adminState.filteredSides = adminState.sides.filter(s => {
            return s.name.toLowerCase().includes(sQ) || String(s.calories).includes(sQ);
        });

        this.renderAdminSidesTable();
    },

    renderAdminSidesTable() {
        const tbody = document.getElementById('admin-sides-list');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (adminState.filteredSides.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px; color:var(--text-muted);">No matching side dishes found.</td></tr>';
            return;
        }

        adminState.filteredSides.forEach(side => {
            const tr = document.createElement('tr');
            tr.dataset.id = side.id;

            tr.innerHTML = `
                <td><input type="text" class="edit-input side-name" value="${side.name.replace(/"/g, '&quot;')}"></td>
                <td><input type="number" class="edit-input side-cal" value="${side.calories || 0}" style="width: 80px;"></td>
                <td>
                    <span style="color: ${side.is_active ? 'var(--accent-color)' : 'var(--text-muted)'}; font-weight: 500;">
                        <i class="fa-solid fa-circle-${side.is_active ? 'check' : 'xmark'}"></i> ${side.is_active ? 'Live' : 'Inactive'}
                    </span>
                    <label style="margin-left: 10px; font-size: 0.8em; cursor: pointer;">
                        <input type="checkbox" class="side-active-check" ${side.is_active ? 'checked' : ''} onchange="this.parentElement.parentElement.parentElement.classList.add('dirty-row')"> Toggle
                    </label>
                </td>
                <td style="display:flex; gap:16px;">
                    <i class="fa-solid fa-save action-icon" title="Save Changes" onclick="adminApp.saveAdminSide(this, '${side.id}')"></i>
                    <i class="fa-solid fa-trash action-icon" title="Delete" style="color: #ef5350;" onclick="adminApp.deleteAdminSide('${side.id}')"></i>
                </td>
            `;

            tr.querySelectorAll('input[type="text"], input[type="number"]').forEach(input => {
                input.addEventListener('input', () => {
                    tr.classList.add('dirty-row'); // You can style dirty-row visually in CSS if you want
                });
            });

            tbody.appendChild(tr);
        });
    },

    addNewSideRow() {
        const tbody = document.getElementById('admin-sides-list');
        if (!tbody) return;

        // Remove the empty placeholder if it exists
        if (tbody.querySelector('td[colspan="4"]')) {
            tbody.innerHTML = '';
        }

        const tr = document.createElement('tr');
        tr.classList.add('dirty-row');

        tr.innerHTML = `
            <td><input type="text" class="edit-input side-name" placeholder="E.g. Roasted Asparagus"></td>
            <td><input type="number" class="edit-input side-cal" value="0" style="width: 80px;"></td>
            <td>
                <label style="font-size: 0.8em; cursor: pointer;">
                    <input type="checkbox" class="side-active-check" checked> Live
                </label>
            </td>
            <td style="display:flex; gap:16px;">
                <i class="fa-solid fa-save action-icon" title="Save New" style="color:var(--accent-color);" onclick="adminApp.saveAdminSide(this, null)"></i>
                <i class="fa-solid fa-trash action-icon" title="Cancel" style="color: #ef5350;" onclick="this.parentElement.parentElement.remove()"></i>
            </td>
        `;

        // Prepend to top
        tbody.insertBefore(tr, tbody.firstChild);
    },

    async saveAdminSide(iconBtn, id) {
        const tr = iconBtn.closest('tr');
        const nameVal = tr.querySelector('.side-name').value.trim();
        if (!nameVal) return alert("Side dish name cannot be blank!");

        const calVal = parseInt(tr.querySelector('.side-cal').value) || 0;
        const activeVal = tr.querySelector('.side-active-check').checked;

        iconBtn.className = "fa-solid fa-spinner fa-spin action-icon";

        try {
            if (id) {
                // Update
                const { error } = await db.from('global_side_dishes')
                    .update({ name: nameVal, calories: calVal, is_active: activeVal })
                    .eq('id', id);
                if (error) throw error;
            } else {
                // Insert
                const { error } = await db.from('global_side_dishes')
                    .insert([{ name: nameVal, calories: calVal, is_active: activeVal }]);
                if (error) throw error;
            }

            // Successfully saved, re-render everything
            await this.fetchAdminSides();
        } catch (e) {
            console.error(e);
            alert("Error saving side: " + e.message);
            iconBtn.className = "fa-solid fa-save action-icon"; // Reset if failed
        }
    },

    async deleteAdminSide(id) {
        if (!confirm("Are you sure you want to completely delete this side dish? It will disappear from all user systems.")) return;

        try {
            const { error } = await db.from('global_side_dishes').delete().eq('id', id);
            if (error) throw error;

            await this.fetchAdminSides();
        } catch (e) {
            alert("Error deleting: " + e.message);
        }
    }, // END SIDE DISHES

    // ===================================
    // USER MANAGEMENT SYSTEM
    // ===================================

    async fetchAdminUsers() {
        try {
            console.log("Admin: Fetching users...");
            const { data, error } = await db.from('users').select('*').order('created_at', { ascending: false });
            if (error) throw error;

            // Format data slightly to avoid strict null checks in UI
            adminState.users = data.map(u => ({
                ...u,
                first_name: u.first_name || 'Anonymous User',
                subscription_status: u.subscription_status || 'free',
                diet_preference_id: u.diet_preference_id || 'Not Set',
                week_start_day: u.week_start_day || 'Monday',
                lifetime_referrals: u.lifetime_referrals || 0,
                banked_free_months: u.banked_free_months || 0
            }));

            this.applyUserFilters();
        } catch (e) {
            console.error("Admin: Failed pulling users", e);
        }
    },

    applyUserFilters() {
        const searchInput = document.getElementById('filter-users-search');
        const statusInput = document.getElementById('filter-users-status');

        if (!searchInput || !statusInput) return;

        const sQ = searchInput.value.toLowerCase();
        const stQ = statusInput.value;

        adminState.filteredUsers = adminState.users.filter(u => {
            const matchSearch = String(u.id).toLowerCase().includes(sQ) ||
                (u.email && u.email.toLowerCase().includes(sQ)) ||
                u.first_name.toLowerCase().includes(sQ);
            if (!matchSearch) return false;

            if (stQ === 'active' && u.subscription_status !== 'active') return false;
            if (stQ === 'trial' && u.subscription_status !== 'trial') return false;
            if (stQ === 'canceled' && !['canceled', 'expired'].includes(u.subscription_status)) return false;

            return true;
        });

        this.renderAdminUsersTable();

        if (adminState.filteredUsers.length > 0) {
            this.openUserPanel(adminState.filteredUsers[0].id);
        } else {
            document.getElementById('admin-user-detail-panel').style.display = 'none';
        }
    },

    renderAdminUsersTable() {
        const tbody = document.getElementById('admin-users-list');
        if (!tbody) return;

        tbody.innerHTML = '';

        if (adminState.filteredUsers.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px; color:var(--text-muted);">No users found matching current filters.</td></tr>';
            return;
        }

        adminState.filteredUsers.forEach(user => {
            const tr = document.createElement('tr');
            tr.dataset.id = user.id;

            let badgeConfig = { bg: '#eef4ef', color: '#6b8b72', text: 'Free Tier' }; // Default
            if (user.subscription_status === 'active') {
                badgeConfig = { bg: '#fbf5eb', color: '#b38822', text: 'Active PRO' };
            } else if (user.subscription_status === 'trial') {
                badgeConfig = { bg: '#e3f2fd', color: '#1976d2', text: 'Trial' };
            } else if (user.subscription_status === 'canceled' || user.subscription_status === 'expired') {
                badgeConfig = { bg: '#fff5f5', color: '#e57373', text: 'Canceled' };
            }

            const initials = user.first_name.charAt(0).toUpperCase();

            tr.innerHTML = `
                <td>
                    <div style="display:flex; align-items:center; gap:8px;">
                        <div style="width:20px; height:20px; border-radius:50%; background:var(--accent-color); color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.6rem;">${initials}</div>
                        <span style="font-weight:600; color:var(--text-main); font-size:0.85rem;">${user.first_name}</span>
                    </div>
                </td>
                <td><span style="font-size:0.75rem; color:var(--text-muted);">${user.email}</span></td>
                <td><span style="display:inline-block; padding:2px 8px; border-radius:20px; font-size:0.7rem; font-weight:600; background:${badgeConfig.bg}; color:${badgeConfig.color};">${badgeConfig.text}</span></td>
                <td><span style="font-weight:600; font-size:0.8rem; color:var(--text-main);"><i class="fa-solid fa-fire" style="color:#ffb4a2;"></i> Active</span></td>
                <td><span style="font-size:0.8rem; color:var(--text-muted);">${new Date(user.created_at).toLocaleDateString()}</span></td>
            `;

            tr.onclick = () => this.openUserPanel(user.id);
            tr.style.cursor = "pointer";

            if (user.id === adminState.activeUserId) {
                tr.classList.add('active-row');
            }

            tbody.appendChild(tr);
        });
    },

    openUserPanel(id) {
        adminState.activeUserId = id;
        const user = adminState.users.find(u => u.id === id);
        if (!user) return;

        document.getElementById('admin-user-detail-panel').style.display = 'flex';
        document.getElementById('admin-user-detail-panel').style.flexDirection = 'column';

        document.querySelectorAll('#admin-users-list tr').forEach(tr => {
            tr.classList.remove('active-row');
            if (tr.dataset.id === id) tr.classList.add('active-row');
        });

        document.getElementById('au-initials').innerText = user.first_name.charAt(0).toUpperCase();
        document.getElementById('au-name').innerText = user.first_name;
        document.getElementById('au-email').innerText = user.email;
        document.getElementById('au-id').innerText = user.id;

        document.getElementById('au-sub').innerText = String(user.subscription_status).toUpperCase();
        document.getElementById('au-created').innerText = new Date(user.created_at).toLocaleDateString();
        document.getElementById('au-referrals').innerText = user.lifetime_referrals;
        document.getElementById('au-banked').innerText = user.banked_free_months;

        document.getElementById('au-diet').innerText = user.diet_preference_id;
        document.getElementById('au-week').innerText = user.week_start_day;
        document.getElementById('au-billing').innerText = user.revenuecat_app_user_id || 'Not Linked';

        const lifetimeBtn = document.getElementById('au-lifetime-btn');
        if (lifetimeBtn) {
            if (user.is_lifetime_free) {
                lifetimeBtn.innerHTML = '<i class="fa-solid fa-gift" style="color: #666;"></i> Revoke Lifetime Access';
            } else {
                lifetimeBtn.innerHTML = '<i class="fa-solid fa-gift" style="color: #d4af37;"></i> Grant Lifetime Access';
            }
        }
    },

    async toggleLifetimeAccess() {
        if (!adminState.activeUserId) return;
        const user = adminState.users.find(u => u.id === adminState.activeUserId);
        if (!user) return;

        const newState = !user.is_lifetime_free;
        if (!confirm(`${newState ? 'Grant' : 'Revoke'} Lifetime Access for ${user.first_name}?`)) return;

        try {
            const { error } = await db.from('users')
                .update({ is_lifetime_free: newState })
                .eq('id', user.id);

            if (error) throw error;
            await this.fetchAdminUsers();
            
            // Re-open panel so UI state refreshes seamlessly
            this.openUserPanel(adminState.activeUserId);
        } catch (e) {
            alert("Error toggling lifetime access: " + e.message);
        }
    },

    async grantFreeMonth() {
        if (!adminState.activeUserId) return;
        const user = adminState.users.find(u => u.id === adminState.activeUserId);
        if (!user) return;

        if (!confirm(`Grant 1 Free Month to ${user.first_name}?`)) return;

        try {
            const { error } = await db.from('users')
                .update({ banked_free_months: user.banked_free_months + 1 })
                .eq('id', user.id);

            if (error) throw error;

            await this.fetchAdminUsers();
        } catch (e) {
            alert("Error granting free month: " + e.message);
        }
    },

    async deleteUser() {
        if (!adminState.activeUserId) return;
        if (!confirm("DANGER: Are you sure you want to permanently delete this user? This destroys their active meals, exclusions, shopping lists, and cannot be undone.")) return;

        try {
            const { error } = await db.from('users').delete().eq('id', adminState.activeUserId);
            if (error) throw error;

            await this.fetchAdminUsers();
        } catch (e) {
            alert("Error deleting user: " + e.message);
        }
    }, // END USER MANAGEMENT

    // ===================================
    // FINANCE & REVENUE AGGREGATION
    // ===================================

    async computeFinanceData() {
        try {
            console.log("Admin: Computing Live Revenue...");

            // If the users array hasn't been fetched yet, pull it directly
            if (adminState.users.length === 0) {
                const { data } = await db.from('users').select('*');
                adminState.users = data || [];
            }

            // Estimate Revenue strictly based on "active" (PRO) subscription holders.
            // Note: In real life you would hit RevenueCat's API metrics for exact numbers.
            const activeUsers = adminState.users.filter(u => u.subscription_status === 'active');
            const proCount = activeUsers.length;

            const EST_MONTHLY_COST = 9.99; // $9.99/mo assumed subscription tier
            const mrr = proCount * EST_MONTHLY_COST;
            const arr = mrr * 12;

            const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

            document.getElementById('stat-mrr').innerHTML = formatter.format(mrr) + ' <span class="trend" style="color:#0fad49; background:#e8fdf0;"><i class="fa-solid fa-arrow-trend-up"></i> Live</span>';
            document.getElementById('stat-arr').innerHTML = formatter.format(arr) + ' <span class="trend" style="color:#0fad49; background:#e8fdf0;"><i class="fa-solid fa-arrow-trend-up"></i> Live</span>';
            document.getElementById('stat-active-subs').innerHTML = proCount.toLocaleString('en-US') + ' <span class="trend" style="color:#0fad49; background:#e8fdf0;">PRO Accounts</span>';
            document.getElementById('stat-arpu').innerText = formatter.format(proCount > 0 ? EST_MONTHLY_COST : 0);

        } catch (e) {
            console.error("Admin: Failed crunching MRR", e);
        }
    },

    // ===================================
    // COMMUNICATIONS SYSTEM
    // ===================================

    switchCommsTab(tabName) {
        adminState.commsTab = tabName;
        document.querySelectorAll('.comms-tab').forEach(btn => btn.classList.remove('active'));
        document.getElementById(`tab-${tabName.toLowerCase()}`).classList.add('active');

        // Hide Composer natively safely
        const comp = document.getElementById('thread-composer');
        if (comp) comp.style.display = 'none';

        this.renderCommsList();
    },

    async fetchAdminTickets() {
        try {
            console.log("Admin: Fetching unified communications hub...");

            // 1. Fetch Global Broadcasts
            const { data: globalData } = await db.from('inbox_messages')
                .select('*')
                .is('user_id', null)
                .order('created_at', { ascending: false });
            adminState.globalBroadcasts = globalData || [];

            // 2. Fetch Support Tickets (Bugs & Recipes)
            const { data: ticketData, error } = await db.from('support_tickets')
                .select(`
                    id, 
                    subject_tag, 
                    status, 
                    created_at,
                    users ( id, first_name, email ),
                    support_messages ( id, sender_type, message_body, timestamp )
                `)
                .order('created_at', { ascending: false });

            if (error) throw error;

            const allTix = ticketData || [];
            adminState.bugReports = allTix.filter(t => t.subject_tag === 'BUG' || t.subject_tag === 'IDEA' || t.subject_tag === 'BILLING');
            adminState.recipeNotices = allTix.filter(t => t.subject_tag === 'RECIPE');

            // 3. Compute dynamic sidebar badge
            const openCommsCount = allTix.filter(t => t.status === 'open').length;
            const sidebarBadge = document.getElementById('sidebar-unread-comms');
            if (sidebarBadge) {
                if (openCommsCount > 0) {
                    sidebarBadge.innerText = openCommsCount;
                    sidebarBadge.style.display = 'inline-block';
                } else {
                    sidebarBadge.style.display = 'none';
                }
            }

            // Boot the active list
            if (!adminState.commsTab) adminState.commsTab = 'global';
            this.switchCommsTab(adminState.commsTab);

        } catch (e) {
            console.error("Admin: Failed pulling comms", e);
        }
    },

    renderCommsList() {
        const listDiv = document.getElementById('admin-comms-list');
        if (!listDiv) return;

        listDiv.innerHTML = '';
        let targetArray = [];

        if (adminState.commsTab === 'global') targetArray = adminState.globalBroadcasts;
        if (adminState.commsTab === 'BUG') targetArray = adminState.bugReports;
        if (adminState.commsTab === 'RECIPE') targetArray = adminState.recipeNotices;

        if (targetArray.length === 0) {
            listDiv.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted); font-weight:500;">No logs found for this filter.</div>';
            return;
        }

        targetArray.forEach(item => {
            const card = document.createElement('div');
            card.className = "message-card";
            if (adminState.activeTicketId === item.id) card.className += " active";

            let name, dateStr, previewMsg, tagHtml;

            if (adminState.commsTab === 'global') {
                name = 'System Global Broadcast';
                dateStr = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                previewMsg = item.body;
                tagHtml = `<span class="tag" style="background:#e3f2fd; color:#1976d2;"><i class="fa-solid fa-earth-americas"></i> ALL USERS</span>`;
            } else {
                name = item.users ? item.users.first_name : 'Unknown User';
                dateStr = new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                let msgs = item.support_messages || [];
                msgs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Newest first
                previewMsg = msgs.length > 0 ? msgs[0].message_body : "No message history.";

                let tagClass = 'tag-info';
                if (item.subject_tag === 'BUG') tagClass = 'tag-bug';
                if (item.subject_tag === 'IDEA') tagClass = 'tag-idea';
                if (item.subject_tag === 'BILLING') tagClass = 'tag-billing';
                if (item.status === 'closed') {
                    tagClass = 'tag-closed';
                    card.style.opacity = '0.55';
                }

                tagHtml = `<span class="tag ${tagClass}">${item.status === 'closed' ? 'RESOLVED' : item.subject_tag}</span>`;
            }

            // Slice preview
            if (previewMsg && previewMsg.length > 55) previewMsg = previewMsg.substring(0, 55) + '...';

            card.innerHTML = `
                <div class="msg-header">
                    <span class="msg-sender">${name}</span>
                    <span class="msg-time">${dateStr}</span>
                </div>
                <div class="msg-subject">
                    ${tagHtml} ${adminState.commsTab === 'global' ? item.title : 'User Thread'}
                </div>
                <div class="msg-preview">${previewMsg || 'No text found.'}</div>
            `;

            card.onclick = () => {
                adminState.activeTicketId = item.id;
                document.querySelectorAll('.message-card').forEach(c => c.classList.remove('active'));
                card.classList.add('active');
                this.renderThreadHistory(item);
            };

            listDiv.appendChild(card);
        });
    },

    initGlobalNewMessage() {
        // Automatically flip to Global tab
        this.switchCommsTab('global');

        // Blank out active ticket
        adminState.activeTicketId = null;
        document.querySelectorAll('.message-card').forEach(c => c.classList.remove('active'));

        // Reset Right Pane into "Composer" State
        const thInfo = document.getElementById('th-info');
        if (!thInfo) return;

        thInfo.style.display = 'flex';
        document.getElementById('th-title').innerText = "Staging New Broadcast";
        document.getElementById('th-subtitle').innerText = "This message will be dispatched to all registered push-enabled devices.";
        document.getElementById('th-badge').style.display = 'none';
        document.getElementById('th-close').style.display = 'none';

        const threadBox = document.getElementById('thread-messages');
        threadBox.innerHTML = '<div style="margin: auto; color:#aaa; font-style:italic; font-weight:500;">Fill out the payload below to physically ping all devices.</div>';

        // Unlock Composer layout for globals
        const composer = document.getElementById('thread-composer');
        composer.style.display = 'flex';
        document.getElementById('composer-extras').style.display = 'flex';
        document.getElementById('composer-title').value = '';
        document.getElementById('composer-text').value = '';
        document.getElementById('composer-notice').style.display = 'block';

        // Swap the enter key binding mode
        document.getElementById('composer-send').onclick = () => this.dispatchGlobalBroadcast();
    },

    renderThreadHistory(item) {
        const thInfo = document.getElementById('th-info');
        const thClose = document.getElementById('th-close');

        thInfo.style.display = 'flex';

        const threadBox = document.getElementById('thread-messages');
        threadBox.innerHTML = ''; // Wipe clean

        if (adminState.commsTab === 'global') {
            document.getElementById('th-title').innerText = "Global Push Notification";
            document.getElementById('th-subtitle').innerText = `Dispatched: ${new Date(item.created_at).toLocaleString()}`;
            document.getElementById('th-badge').style.display = 'none';
            thClose.style.display = 'none';

            // Just show the one message in the middle as an info card
            threadBox.innerHTML = `
               <div class="chat-global">
                   <strong style="display:block; margin-bottom: 8px;">${item.title}</strong>
                   ${item.body}
               </div>
               <div class="chat-timestamp ts-center">Dispatched to ${adminState.usersCount > 0 ? adminState.usersCount : 'all'} active devices at ${new Date(item.created_at).toLocaleTimeString()}</div>
            `;

            // Globals cannot be replied to natively
            document.getElementById('thread-composer').style.display = 'none';

        } else {
            // It's a User Thread
            document.getElementById('th-title').innerText = item.users ? item.users.first_name : 'Unknown User';
            document.getElementById('th-subtitle').innerText = `Started: ${new Date(item.created_at).toLocaleDateString()}`;

            const badge = document.getElementById('th-badge');
            badge.style.display = 'inline-block';
            badge.innerText = item.status === 'closed' ? 'RESOLVED' : item.subject_tag;

            let badgeClass = 'tag-info';
            if (item.subject_tag === 'BUG') badgeClass = 'tag-bug';
            if (item.subject_tag === 'IDEA') badgeClass = 'tag-idea';
            if (item.subject_tag === 'BILLING') badgeClass = 'tag-billing';
            if (item.status === 'closed') badgeClass = 'tag-closed';
            badge.className = "tag " + badgeClass;

            thClose.style.display = item.status === 'closed' ? 'none' : 'block';

            let msgs = item.support_messages || [];
            msgs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)); // Oldest logic for chronological reading

            msgs.forEach(m => {
                const bubble = document.createElement('div');
                const isUser = m.sender_type === 'user';
                bubble.className = "chat-bubble " + (isUser ? "chat-left" : "chat-right");

                // Allow line breaks from database to parse correctly
                const safeHTML = m.message_body.replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, '<br>');
                bubble.innerHTML = safeHTML;

                const ts = document.createElement('div');
                ts.className = "chat-timestamp " + (isUser ? "ts-left" : "ts-right");
                ts.innerText = new Date(m.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });

                threadBox.appendChild(bubble);
                threadBox.appendChild(ts);
            });

            // Unlock Composer
            if (item.status === 'open') {
                document.getElementById('thread-composer').style.display = 'flex';
                document.getElementById('composer-extras').style.display = 'none'; // Hide title box
                document.getElementById('composer-text').value = '';
                document.getElementById('composer-notice').style.display = 'none';

                document.getElementById('composer-send').onclick = () => this.sendThreadMessage(item.id, item.users.id);
            } else {
                document.getElementById('thread-composer').style.display = 'none';
            }

            // Scroll to bottom
            setTimeout(() => { threadBox.scrollTop = threadBox.scrollHeight; }, 100);
        }
    },

    async dispatchGlobalBroadcast() {
        const title = document.getElementById('composer-title').value.trim();
        const body = document.getElementById('composer-text').value.trim();

        if (!title || !body) return alert("Headline and Body cannot be empty!");
        if (!confirm("Are you sure you want to dispatch this push notification to devices globally?")) return;

        try {
            // 1. Send to System Announcements for Splash Screen Logs
            const { error } = await db.from('system_announcements').insert([{
                title: title, body: body, target_segment: 'all', is_active: true
            }]);
            if (error) throw error;

            // 2. Fork into unified Inbox engine with null ID for universal consumption
            const { error: inboxErr } = await db.from('inbox_messages').insert([{
                user_id: null, type: 'broadcast', title: title, body: body
            }]);
            if (inboxErr) throw inboxErr;

            await this.logAdminAudit('Broadcast Global Push Notification');
            alert("Broadcast Dispatched Globally!");
            await this.fetchAdminTickets(); // Refreshes left pane and active states natively

        } catch (e) {
            alert("Broadcast Error: " + e.message);
        }
    },

    async sendThreadMessage(ticketId, userId) {
        const box = document.getElementById('composer-text');
        const msg = box.value.trim();
        if (!msg) return;

        // Block UI spam
        document.getElementById('composer-send').style.opacity = '0.5';
        document.getElementById('composer-send').style.pointerEvents = 'none';

        try {
            // 1. Attach natively to the thread array
            const { error } = await db.from('support_messages').insert([{
                ticket_id: ticketId,
                sender_type: 'admin',
                message_body: msg
            }]);
            if (error) throw error;

            // 2. Light up the user's phone Inbox badge so they know they got a reply
            await db.from('inbox_messages').insert([{
                user_id: userId,
                type: 'support_reply',
                title: 'New Reply from Admin',
                body: msg,
                ticket_id: ticketId
            }]);

            await this.logAdminAudit('Sent Support Message Reply', ticketId);

            box.value = "";
            box.style.height = '46px'; // Reset flex height
            await this.fetchAdminTickets(); // Triggers UI re-render

            // Re-select the ticket because the list fetched intrinsically
            const refreshedItem = (adminState.commsTab === 'BUG' ? adminState.bugReports : adminState.recipeNotices).find(t => t.id === ticketId);
            if (refreshedItem) this.renderThreadHistory(refreshedItem);

        } catch (e) {
            alert("Error sending reply: " + e.message);
        } finally {
            document.getElementById('composer-send').style.opacity = '1';
            document.getElementById('composer-send').style.pointerEvents = 'all';
        }
    },

    async closeTicket() {
        if (!adminState.activeTicketId) return;
        if (!confirm("Mark this communication thread as resolved? They can always reply again later to reopen it.")) return;

        try {
            const { error } = await db.from('support_tickets')
                .update({ status: 'closed' })
                .eq('id', adminState.activeTicketId);
            if (error) throw error;

            await this.logAdminAudit('Resolved Support Ticket', adminState.activeTicketId);

            await this.fetchAdminTickets();
            // The currently open thread will simply rerender as disabled/closed.
            const targetArray = adminState.commsTab === 'BUG' ? adminState.bugReports : adminState.recipeNotices;
            const refreshedItem = targetArray.find(t => t.id === adminState.activeTicketId);
            if (refreshedItem) this.renderThreadHistory(refreshedItem);

        } catch (e) {
            alert("Error closing ticket: " + e.message);
        }
    }, // END COMMUNICATIONS

    // ===================================
    // MAIN PORTAL AGGREGATION
    // ===================================
    async computePortalDashboard() {
        try {
            console.log("Admin: Crunching Portal Dashboard Data...");

            // 1. Ensure primary DB queries are satisfied
            if (adminState.users.length === 0) {
                const { data } = await db.from('users').select('*').order('created_at', { ascending: false });
                adminState.users = data || [];
            }
            if (adminState.tickets.length === 0) {
                const { data } = await db.from('support_tickets').select(`
                    *,
                    users ( name, email )
                `).order('created_at', { ascending: false });
                adminState.tickets = data || [];
            }

            // 2. Crunch KPI Math
            const totalUsers = adminState.users.length;
            const proUsers = adminState.users.filter(u => u.subscription_status === 'active').length;
            const openTickets = adminState.tickets.filter(t => t.status === 'open').length;

            document.getElementById('portal-total-users').innerText = totalUsers.toLocaleString('en-US');
            document.getElementById('portal-pro-subs').innerText = proUsers.toLocaleString('en-US');
            document.getElementById('portal-unread-tickets').innerText = openTickets.toLocaleString('en-US');

            const signupRateEl = document.getElementById('portal-signup-rate');
            if (signupRateEl) {
                if (adminState.users.length < 2) {
                    signupRateEl.innerText = "N/A";
                } else {
                    const sampleSize = Math.min(adminState.users.length, 10);
                    const newest = new Date(adminState.users[0].created_at).getTime();
                    const oldest = new Date(adminState.users[sampleSize - 1].created_at).getTime();
                    const diffMs = newest - oldest;
                    
                    if (diffMs <= 0) {
                        signupRateEl.innerText = "Simultaneous";
                    } else {
                        const avgMs = diffMs / (sampleSize - 1);
                        const avgMins = avgMs / 60000;
                        const avgHours = avgMins / 60;
                        const avgDays = avgHours / 24;
                        const avgWeeks = avgDays / 7;
                        
                        if (avgWeeks >= 1) {
                            signupRateEl.innerText = `1 every ${Math.round(avgWeeks)} week${Math.round(avgWeeks) > 1 ? 's' : ''}`;
                        } else if (avgDays >= 1) {
                            signupRateEl.innerText = `1 every ${Math.round(avgDays)} day${Math.round(avgDays) > 1 ? 's' : ''}`;
                        } else if (avgHours >= 1) {
                            signupRateEl.innerText = `1 every ${Math.round(avgHours)} hr${Math.round(avgHours) > 1 ? 's' : ''}`;
                        } else if (avgMins >= 1) {
                            signupRateEl.innerText = `1 every ${Math.round(avgMins)} min${Math.round(avgMins) > 1 ? 's' : ''}`;
                        } else {
                            signupRateEl.innerText = `1 every ${Math.round(avgMs/1000)} sec`;
                        }
                    }
                }
            }

            // 3. Render 'Recent Signups' Mini-Table
            const usersTbody = document.getElementById('admin-users-recent-tbody');
            if (usersTbody) {
                usersTbody.innerHTML = '';
                // Since users are already sorted by created_at descending, grab top 5
                const recentSignups = adminState.users.slice(0, 5);

                if (recentSignups.length === 0) {
                    usersTbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 20px; color:#888;">No signups found</td></tr>';
                }

                recentSignups.forEach(u => {
                    const tr = document.createElement('tr');

                    let statusHtml = '<span style="background:#e0e0e0; color:#424242; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:700;">INACTIVE</span>';
                    if (u.subscription_status === 'active') {
                        statusHtml = '<span style="background:#e8f5e9; color:#2e7d32; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:700;">PRO</span>';
                    } else if (u.subscription_status === 'trial') {
                        statusHtml = '<span style="background:#fff3e0; color:#ef6c00; padding:4px 8px; border-radius:4px; font-size:0.75rem; font-weight:700;">TRIAL</span>';
                    }
                    const initials = (u.first_name || 'A').charAt(0).toUpperCase();
                    tr.innerHTML = `
                        <td>
                            <div style="display:flex; align-items:center; gap:6px;">
                                <div style="width:20px; height:20px; border-radius:50%; background:var(--accent-color); color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:0.6rem;">${initials}</div>
                                <span style="font-weight:600; color:var(--text-main); font-size:0.8rem;">${u.first_name || 'Anonymous User'}</span>
                            </div>
                        </td>
                        <td><span style="font-size:0.75rem; color:var(--text-muted);">${u.email}</span></td>
                        <td style="text-transform: capitalize; font-size:0.8rem;">${u.diet_preference_id || 'Standard'}</td>
                        <td>${statusHtml}</td>
                        <td><span style="font-size:0.75rem; color:var(--text-muted);">${new Date(u.created_at).toLocaleDateString()}</span></td>
                    `;
                    usersTbody.appendChild(tr);
                });
            }

            // 4. Render 'Recent Tickets' Feed
            const ticketsFeedDiv = document.getElementById('portal-recent-tickets-feed');
            if (ticketsFeedDiv) {
                ticketsFeedDiv.innerHTML = '';
                const recentTickets = adminState.tickets.slice(0, 4);

                if (recentTickets.length === 0) {
                    ticketsFeedDiv.innerHTML = '<div style="padding: 40px; text-align: center; color: var(--text-muted);">No system activities found. App pending launch.</div>';
                }

                recentTickets.forEach(t => {
                    const ticketEl = document.createElement('div');
                    ticketEl.style.padding = '16px 24px';
                    ticketEl.style.borderBottom = '1px solid var(--border-light)';

                    const userName = t.users ? t.users.name : 'Unknown User';
                    const userEmail = t.users ? t.users.email : '';
                    const timeAgo = new Date(t.created_at).toLocaleDateString();

                    ticketEl.innerHTML = `
                        <div style="display:flex; justify-content: space-between; align-items:flex-start; margin-bottom: 8px;">
                            <strong style="color:var(--text-main); font-size: 0.95rem;">${t.subject}</strong>
                            <span style="font-size:0.75rem; color:#888;">${timeAgo}</span>
                        </div>
                        <div style="font-size:0.85rem; color:var(--text-muted); margin-bottom: 8px;">
                            Requested by: <span style="font-weight:600; color:var(--text-main);">${userName}</span> (${userEmail})
                        </div>
                        <a href="admin-comms.html?ticket=${t.id}" style="font-size:0.8rem; color:var(--accent-blue); text-decoration:none; font-weight:600;">Resolve Ticket &rarr;</a>
                    `;
                    ticketsFeedDiv.appendChild(ticketEl);
                });
            }

        } catch (e) { console.error("Admin: Failed crunching Portal metrics", e); }
    },

    // ===================================
    // ADMIN SECURITY & AUDIT
    // ===================================

    async fetchAdminEmployees() {
        try {
            console.log("Admin: Fetching employees...");
            const { data, error } = await db.from('admin_users').select('*').order('created_at', { ascending: true });
            if (error) throw error;
            adminState.employees = data || [];
            this.renderAdminEmployees();
        } catch (e) { console.error("Error fetching employees", e); }
    },

    async fetchAuditLogs() {
        try {
            const { data, error } = await db.from('admin_audit_logs')
                .select(`
                    timestamp,
                    action_type,
                    target_entity_id,
                    admin_users ( email )
                `)
                .order('timestamp', { ascending: false })
                .limit(100);
            if (error) throw error;
            adminState.auditLogs = data || [];
            this.renderAuditLogs();
        } catch (e) { console.error("Error fetching audit logs", e); }
    },

    renderAuditLogs() {
        const tbody = document.getElementById('admin-security-logs');
        if (!tbody) return;

        tbody.innerHTML = '';
        if (adminState.auditLogs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding: 40px; color: #888;">No audit logs discovered.</td></tr>';
            return;
        }

        adminState.auditLogs.forEach(l => {
            const tr = document.createElement('tr');
            const d = new Date(l.timestamp).toLocaleString();
            const adminEmail = l.admin_users ? l.admin_users.email : 'System Event';

            tr.innerHTML = `
                <td><span style="font-size: 0.85rem; color: #888;">${d}</span></td>
                <td><strong style="color:var(--text-main); font-size:0.9rem;">${adminEmail}</strong></td>
                <td><span class="audit-tag" style="background:#f1f3f5; color:#495057; font-size:0.75rem;">${l.action_type}</span></td>
                <td style="font-size: 0.8rem; font-family: monospace; color: #666; word-break: break-all;">${l.target_entity_id || 'N/A'}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    renderAdminEmployees() {
        const listDiv = document.getElementById('admin-security-employees');
        if (!listDiv) return;

        listDiv.innerHTML = '';
        adminState.employees.forEach(e => {
            const card = document.createElement('div');
            card.className = "emp-card";
            if (adminState.activeEmployeeId === e.id) card.className += " active";

            let modulesCount = e.accessible_modules ? e.accessible_modules.length : 8;

            card.innerHTML = `
                <div style="display:flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <strong style="font-size: 0.95rem;">${e.email}</strong>
                    <span class="role-badge" style="background:var(--bg-color); color:var(--text-main); border:1px solid var(--border-light);">${modulesCount} Screens Unlocked</span>
                </div>
                <div style="font-size: 0.75rem; color: #888;">Joined: ${new Date(e.created_at).toLocaleDateString()}</div>
            `;

            card.onclick = () => {
                adminState.activeEmployeeId = e.id;
                document.getElementById('role-editor-panel').style.display = 'block';
                document.getElementById('r-emp-name').innerText = e.email;

                const modules = e.accessible_modules || ['dashboard', 'revenue', 'users', 'recipes', 'sides', 'comms', 'settings', 'security'];
                document.querySelectorAll('#screen-checkboxes input[type="checkbox"]').forEach(cb => {
                    cb.checked = modules.includes(cb.value);
                });

                this.renderAdminEmployees(); // Re-render to show active ring
            }
            listDiv.appendChild(card);
        });
    },

    openInvitePanel() {
        document.getElementById('invite-editor-panel').style.display = 'block';
        document.getElementById('role-editor-panel').style.display = 'none';
        document.getElementById('invite-email').value = '';
    },

    async sendEmployeeInvite() {
        try {
            const emailInput = document.getElementById('invite-email').value.trim();
            if (!emailInput) return alert("Please type an email address first.");

            // Collect selected modules for the invite
            const checkboxes = document.querySelectorAll('.inv-checkbox');
            let allowedScreens = [];
            checkboxes.forEach(cb => {
                if (cb.checked) allowedScreens.push(cb.value);
            });

            // 1. Inject the employee directly into the Admin Roster (Whitelist them)
            const { error: insertErr } = await db.from('admin_users').insert([{
                email: emailInput,
                accessible_modules: allowedScreens
            }]);

            if (insertErr) {
                // E.g. unique constraint failure if they are already an admin
                throw new Error("Failed to whitelist employee (they may already exist). Detail: " + insertErr.message);
            }

            // 2. Log the invite to the audit engine
            await db.from('admin_audit_logs').insert([{
                admin_id: adminState.currentEmployeeId,
                action_type: 'EMPLOYEE_INVITED',
                target_entity_id: `email: ${emailInput}`
            }]);

            // 3. Trigger Supabase Native Magic Link !
            alert("Whitelisted successfully! Instructing Supabase backend to dispatch welcome email...");

            const { data, error } = await db.auth.signInWithOtp({
                email: emailInput,
                options: {
                    shouldCreateUser: true,
                    emailRedirectTo: window.location.origin + '/admin-dashboard.html'
                }
            });

            if (error) {
                throw new Error("Supabase failed to send email: " + error.message);
            }

            alert(`SUCCESS! Supabase has officially dispatched a Magic Login Link to [${emailInput}].\n\nWhen they click that email, they will instantly bypass the password screen and enter the portal using the permissions you just set!`);

            // Refresh UI
            document.getElementById('invite-editor-panel').style.display = 'none';
            await this.fetchAdminEmployees();
            await this.fetchAuditLogs();

        } catch (e) {
            alert("Invite failed: " + e.message);
        }
    },

    async updateAdminRole() {
        if (!adminState.activeEmployeeId) return;

        const checkboxes = document.querySelectorAll('#screen-checkboxes input[type="checkbox"]');
        const allowedScreens = Array.from(checkboxes).filter(cb => cb.checked).map(cb => cb.value);

        if (!confirm("Re-writing system policy restrictions for this employee. Continue?")) return;

        try {
            const { error } = await db.from('admin_users')
                .update({ accessible_modules: allowedScreens })
                .eq('id', adminState.activeEmployeeId);

            if (error) throw error;

            // Log this security event into the audit logs under the EXECUTING admin's UUID
            await db.from('admin_audit_logs').insert([{
                admin_id: adminState.currentEmployeeId,
                action_type: 'SECURITY_MODIFIED_SCREENS',
                target_entity_id: `screens: ${allowedScreens.join(',')} for ${adminState.activeEmployeeId}`
            }]);

            alert("Role policy successfully encoded and logged!");

            await this.fetchAdminEmployees();
            await this.fetchAuditLogs(); // Instantly prove the security log works
            document.getElementById('role-editor-panel').style.display = 'none';

        } catch (e) {
            alert("Error assigning policy: " + e.message);
        }
    }, // END SECURITY

    // ===================================
    // AUTHENTICATION & SESSIONS
    // ===================================

    async logout() {
        console.log("Admin: Executing Secure Sign Out...");
        await db.auth.signOut();
        window.location.href = 'index.html';
    },

    async updateAdminPassword() {
        const passElement = document.getElementById('new-auth-password');
        const newPassword = passElement ? passElement.value : '';

        if (!newPassword || newPassword.length < 12) {
            alert("Security Violation: Passwords must be at least 12 characters long.");
            return;
        }

        try {
            // Update the Supabase Auth system natively
            const { data, error } = await db.auth.updateUser({
                password: newPassword
            });

            if (error) throw error;

            // Log this security event into the audit logs under the EXECUTING admin's UUID
            await db.from('admin_audit_logs').insert([{
                admin_id: adminState.currentEmployeeId,
                action_type: 'ESTABLISHED_PASSWORD',
                target_entity_id: `Self Action`
            }]);

            alert("SUCCESS! Your password has been permanently established. Your browser can now save it globally!");
            passElement.value = ''; // Clean input
        } catch (e) {
            alert("Error updating password: " + e.message);
        }
    },

    // ===================================
    // ONBOARDING & FORCED PASSWORD
    // ===================================
    showForcedPasswordModal() {
        // Strip the HTML CSS Cloak so the modal can actually render, 
        // but wipe the document body first to prevent data leakage!
        document.body.innerHTML = '';
        const authCloak = document.getElementById('auth-cloak');
        if (authCloak) authCloak.remove();

        const overlay = document.createElement('div');
        overlay.style.cssText = "position:fixed; top:0; left:0; width:100vw; height:100vh; background:rgba(0,0,0,0.85); z-index:9999; display:flex; justify-content:center; align-items:center; backdrop-filter:blur(8px); margin:0;";
        overlay.innerHTML = `
            <div style="background:white; padding:40px; border-radius:16px; width:480px; text-align:center; box-shadow:0 12px 40px rgba(0,0,0,0.3);">
                <i class="fa-solid fa-user-lock" style="font-size:3rem; color:var(--accent-blue); margin-bottom:16px;"></i>
                <h2 style="font-size:1.5rem; margin-bottom:12px; font-weight:700;">Welcome to the Team!</h2>
                <p style="color:var(--text-muted); font-size:0.95rem; line-height:1.5; margin-bottom:24px;">To secure your portal access, you must establish a permanent 12-character password. You will use this to log in instead of your email going forward.</p>
                
                <div style="text-align:left; margin-bottom:24px;">
                    <label style="display:block; font-size:0.8rem; font-weight:600; text-transform:uppercase; color:var(--text-muted); margin-bottom:8px;">New Permanent Password</label>
                    <input type="password" id="forced-password-input" placeholder="Minimum 12 Characters..." style="width:100%; padding:14px; border:1px solid var(--border-light); border-radius:8px; font-size:1rem; outline:none;">
                </div>

                <button class="btn btn-primary" style="width:100%; font-size:1.05rem; cursor:pointer;" onclick="adminApp.submitForcedPassword(this)">
                    <i class="fa-solid fa-floppy-disk"></i> Lock In & Enter Portal
                </button>
            </div>
        `;
        document.body.appendChild(overlay);
    },

    async submitForcedPassword(btn) {
        const passBox = document.getElementById('forced-password-input');
        const pass = passBox.value;
        if (!pass || pass.length < 12) return alert("Security Violation: Passwords must be exactly 12 characters or longer.");

        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Securing account...';
        btn.style.pointerEvents = 'none';
        btn.style.opacity = '0.7';

        try {
            // Write the new password natively to Supabase Auth
            const { error: passErr } = await db.auth.updateUser({ password: pass });
            if (passErr) throw passErr;

            // Seed the physical event so the intercept never fires again
            await db.from('admin_audit_logs').insert([{
                admin_id: adminState.currentEmployeeId,
                action_type: 'ESTABLISHED_PASSWORD',
                target_entity_id: 'Onboarding Forced Flow'
            }]);

            // Release the client into the portal
            window.location.reload();
        } catch (err) {
            alert("Failed to establish password: " + err.message);
            btn.style.pointerEvents = 'all';
            btn.style.opacity = '1';
            btn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Lock In & Enter Portal';
        }
    },

    // ===================================
    // GLOBAL DIETS TAXONOMY
    // ===================================
    async fetchGlobalDiets() {
        try {
            const { data, error } = await db.from('global_diets').select('*').order('sort_order', { ascending: true });
            if (error) throw error;
            adminState.globalDiets = data || [];
        } catch (e) {
            console.warn("Global Diets table might not be seeded yet:", e.message);
            // Fallback gracefully so the UI doesn't crash before SQL is executed
            adminState.globalDiets = [];
        }

        this.renderAdminSettingsDiets();
        this.populateRecipeDietDropdowns();
    },

    renderAdminSettingsDiets() {
        const tbody = document.getElementById('admin-diets-tbody');
        if (!tbody) return; // Only runs on admin-settings.html

        if (adminState.globalDiets.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 40px; color:var(--text-muted);">
                <i class="fa-solid fa-triangle-exclamation" style="color:var(--danger-color); font-size:2rem; margin-bottom:12px; display:block;"></i>
                <strong>Database Sync Needed!</strong><br>
                Please execute the SQL file <code>global_diets_setup.sql</code> in your Supabase panel to permanently initialize the 15 diet taxonomies!
            </td></tr>`;
            return;
        }

        tbody.innerHTML = '';
        adminState.globalDiets.forEach(diet => {
            const iconClass = DIET_ICONS[diet.id] || 'fa-solid fa-leaf';
            const actionBtn = diet.is_hidden
                ? `<button class="btn btn-ghost" style="padding: 6px 12px; color: #4a90e2; border-color: #4a90e2;" onclick="adminApp.toggleDietVisibility('${diet.id}', false)">Unhide</button>`
                : `<button class="btn btn-ghost" style="padding: 6px 12px; color: var(--text-muted);" onclick="adminApp.toggleDietVisibility('${diet.id}', true)">Hide</button>`;

            const colorCode = diet.is_hidden ? '#aaa' : '#4a90e2';
            const isSvg = iconClass.startsWith('<svg');
            const iconHTML = isSvg
                ? `<div style="color: ${colorCode}; display: flex; justify-content: center; align-items: center; width: 20px; height: 20px;">${iconClass}</div>`
                : `<i class="${iconClass}" style="color: ${colorCode};"></i>`;

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>
                    <div class="diet-icon-box" style="${diet.is_hidden ? 'opacity: 0.4; background:#eee;' : 'background:#f0f9f4; border-color:#d1e7dd;'}">
                        ${iconHTML}
                    </div>
                </td>
                <td>
                    <strong style="color: ${diet.is_hidden ? 'var(--text-muted)' : 'var(--text-main)'}; text-decoration: ${diet.is_hidden ? 'line-through' : 'none'};">${diet.name}</strong>
                    ${diet.is_hidden ? '<br><span style="font-size:0.75rem; color:var(--danger-color);">Currently Hidden from Users</span>' : ''}
                </td>
                <td style="font-family: monospace; color: var(--text-muted); opacity: ${diet.is_hidden ? '0.5' : '1'};">${diet.id}</td>
                <td style="text-align: right;">${actionBtn}</td>
            `;
            tbody.appendChild(tr);
        });
    },

    async toggleDietVisibility(dietId, makeHidden) {
        try {
            const { error } = await db.from('global_diets').update({ is_hidden: makeHidden }).eq('id', dietId);
            if (error) throw error;
            await this.fetchGlobalDiets(); // Resync UI
        } catch (e) {
            alert("Failed to toggle diet state: " + e.message);
        }
    },

    populateRecipeDietDropdowns() {
        const filterSelect = document.getElementById('filter-diet');
        const editSelect = document.getElementById('edit-diets');

        // Get active visible ones
        const activeDiets = adminState.globalDiets.filter(d => d.is_hidden === false);

        if (filterSelect) {
            const currentVal = filterSelect.value;
            let html = '<option value="">All Diets</option>';
            activeDiets.forEach(d => { html += `<option value="${d.id}">${d.name}</option>`; });
            filterSelect.innerHTML = html;
            filterSelect.value = currentVal; // Restore preference if any
        }

        if (editSelect) {
            // Need to preserve multi-select selections if already loaded
            const selectedArr = Array.from(editSelect.selectedOptions || []).map(o => o.value);

            let html = '';
            activeDiets.forEach(d => {
                const isSel = selectedArr.includes(d.id) ? 'selected' : '';
                html += `<option value="${d.id}" ${isSel}>${d.name}</option>`;
            });
            editSelect.innerHTML = html;
        }
    },

    async uploadLocalImage(event) {
        const file = event.target.files[0];
        if (!file) return;

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `admin-${Date.now()}.${fileExt}`;
            const filePath = `images/${fileName}`;

            const { error: uploadError } = await db.storage.from('recipe-images').upload(filePath, file);

            if (uploadError) {
                throw uploadError;
            }

            const { data: publicUrlData } = db.storage.from('recipe-images').getPublicUrl(filePath);
            
            const urlInput = document.getElementById('edit-image-url');
            urlInput.value = publicUrlData.publicUrl;
            document.getElementById('edit-preview-img').src = publicUrlData.publicUrl;
            
        } catch (e) {
            alert('Upload failed: ' + e.message);
        }
    },

    async suggestDiets() {
        const btn = document.getElementById('ai-diet-suggest-btn');
        const originalText = btn.innerHTML;
        
        const igRows = document.querySelectorAll('#edit-ingredients-list > div');
        const ingredients = [];
        igRows.forEach(row => {
            const n = row.querySelector('.ig-name').value.trim();
            if (n) ingredients.push(n);
        });

        if (ingredients.length === 0) {
            return alert("Please add some ingredients first!");
        }

        const dietSelect = document.getElementById('edit-diets');
        const allDiets = Array.from(dietSelect.options).map(o => ({ value: o.value, text: o.text }));

        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Thinking...';
        btn.disabled = true;

        try {
            const response = await fetch("https://fqhyzrfaacnxqrbznmwo.supabase.co/functions/v1/magic-import", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer sb_publishable_sU9ZTwddoYCOo0NdsSOP1w_qdFo-RM5"
                },
                body: JSON.stringify({
                    type: "diets",
                    payloads: {
                        ingredients: ingredients,
                        allDiets: allDiets
                    }
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Failed to analyze diets.");

            const matchedDiets = data.diets || [];
            
            Array.from(dietSelect.options).forEach(opt => {
                if (matchedDiets.includes(opt.value) || matchedDiets.includes(opt.text)) {
                    opt.selected = true;
                }
            });

        } catch (e) {
            alert("Diet suggestion failed: " + e.message);
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    },

    async generateNewImage() {
        const title = document.getElementById('edit-title').value.trim();
        const customPrompt = document.getElementById('edit-image-prompt') ? document.getElementById('edit-image-prompt').value.trim() : "";
        const finalPrompt = customPrompt || title;

        if (!finalPrompt) {
            return alert("Must have a recipe title or custom prompt first!");
        }

        const btn = document.getElementById('ai-generate-btn');
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Generating...';
        btn.style.pointerEvents = 'none';

        try {
            // 1. Fetch AI Generated Image Binary directly via Edge Proxy
            const response = await fetch("https://fqhyzrfaacnxqrbznmwo.supabase.co/functions/v1/generate-image", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ title: finalPrompt, id: adminState?.activeRecipeId || null })
            });

            if (!response.ok) {
                let errMessage;
                try {
                    const errJson = await response.json();
                    errMessage = errJson.error || response.statusText;
                } catch(e) {
                    errMessage = await response.text();
                }
                throw new Error("AI Edge Function failed: " + errMessage);
            }
            
            // 2. Extract final URL from the Edge function
            const data = await response.json();
            
            // 3. Handle Deduplication Visual Match
            if (data.cached) {
                const overlay = document.createElement('div');
                overlay.style = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.8);z-index:9999;display:flex;justify-content:center;align-items:center;';
                overlay.innerHTML = `
                    <div style="background:#fff;padding:24px;border-radius:16px;text-align:center;max-width:400px;font-family:sans-serif;box-shadow:0 10px 25px rgba(0,0,0,0.5);">
                        <h3 style="margin-top:0;color:#1f2937;font-size:1.25rem;">Visual Match Found!</h3>
                        <p style="color:#4b5563;font-size:0.9rem;margin-bottom:16px;">We found an existing image from a similar recipe. Do you want to reuse it and save $0.04 AI credits?</p>
                        <img src="${data.url}" style="width:100%;height:250px;object-fit:cover;border-radius:8px;margin-bottom:20px;box-shadow:0 4px 6px rgba(0,0,0,0.1);">
                        <div style="display:flex;gap:12px;justify-content:center;">
                            <button id="btn-force-ai" style="padding:10px 16px;border-radius:8px;font-weight:600;cursor:pointer;border:1px solid #d1d5db;background:#f9fafb;color:#374151;flex:1;">Generate New</button>
                            <button id="btn-keep-pic" style="padding:10px 16px;border-radius:8px;font-weight:600;cursor:pointer;border:none;background:#2563eb;color:#fff;flex:1;box-shadow:0 2px 4px rgba(37,99,235,0.3);">Keep It (Free)</button>
                        </div>
                    </div>`;
                document.body.appendChild(overlay);

                document.getElementById('btn-keep-pic').onclick = () => {
                    document.body.removeChild(overlay);
                    document.getElementById('edit-image-url').value = data.url;
                    document.getElementById('edit-preview-img').src = data.url;
                    btn.innerHTML = oldHtml;
                    btn.style.pointerEvents = 'all';
                };

                document.getElementById('btn-force-ai').onclick = async () => {
                    document.body.removeChild(overlay);
                    btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Forcing AI...';
                    try {
                        const forceRes = await fetch("https://fqhyzrfaacnxqrbznmwo.supabase.co/functions/v1/generate-image", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ title: title, id: adminState && adminState.activeRecipeId ? adminState.activeRecipeId : null, force_new: true })
                        });
                        const forceData = await forceRes.json();
                        if (!forceRes.ok) throw new Error(forceData.error || forceRes.statusText);
                        document.getElementById('edit-image-url').value = forceData.url;
                        document.getElementById('edit-preview-img').src = forceData.url;
                    } catch(err) {
                        alert("Forced AI Failed: " + err.message);
                    } finally {
                        btn.innerHTML = oldHtml;
                        btn.style.pointerEvents = 'all';
                    }
                };
                return; // We exit and let the modal buttons clean up the UI spinner
            }
            
            // 4. Normal injection for brand new images
            document.getElementById('edit-image-url').value = data.url;
            document.getElementById('edit-preview-img').src = data.url;

        } catch (e) {
            alert("AI Generation execution failed: " + e.message);
        } finally {
            // Only fire finally if we aren't pausing for the modal choice
            if (btn.innerHTML.includes('Generating...')) {
                btn.innerHTML = oldHtml;
                btn.style.pointerEvents = 'all';
            }
        }
    },

    async runMagicImportUrl(event) {
        if (event) event.preventDefault();
        
        const urlInput = document.getElementById('ai-import-url');
        const url = urlInput.value.trim();
        if (!url) return alert("Please paste a URL first!");

        const btn = document.getElementById('btn-ai-import');
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Extracting...';
        btn.style.pointerEvents = 'none';

        try {
            const { data, error } = await db.functions.invoke('magic-import', {
                body: { type: 'url', payload: url }
            });

            if (error) {
                // Sometimes the error object itself is deeply nested
                throw new Error(error.message || "Unknown Function Error");
            }

            const recipe = data;

            // Aggressive override logic enabled per user approval pattern structure!
            if (recipe.title) document.getElementById('edit-title').value = recipe.title;
            if (recipe.cookTime) document.getElementById('edit-time').value = parseInt(recipe.cookTime) || 30;
            if (recipe.cal) document.getElementById('edit-calories').value = recipe.cal;
            
            // Rebuild Instructions block cleanly
            if (recipe.instructions && Array.isArray(recipe.instructions)) {
                document.getElementById('edit-instructions').value = recipe.instructions.join('\n\n');
            }

            // Image placeholder
            if (recipe.image) {
                 document.getElementById('edit-image-url').value = recipe.image;
                 document.getElementById('edit-preview-img').src = recipe.image;
            }

            // Rebuild entire ingredients manifest
            if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
                document.getElementById('edit-ingredients-list').innerHTML = '';
                recipe.ingredients.forEach(i => {
                    this.addIngredientRow(i);
                });
            }

            alert("Extraction complete! Review the imported recipe data.");
        } catch (e) {
            console.error(e);
            alert("AI Magic Import Failed: " + e.message);
        } finally {
            btn.innerHTML = oldHtml;
            btn.style.pointerEvents = 'all';
        }
    },

    async calculateCalories() {
        const ingredientsBox = document.querySelectorAll('#edit-ingredients-list input[type="text"]');
        const ingredients = [];
        ingredientsBox.forEach(box => {
            if (box.value.trim().length > 0) ingredients.push(box.value.trim());
        });

        if (ingredients.length === 0) {
            return alert("You must add at least one ingredient first before calculating calories!");
        }

        const btn = document.getElementById('ai-calories-btn');
        const oldHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Calc...';
        btn.style.pointerEvents = 'none';

        try {
            const { data, error } = await db.functions.invoke('magic-import', {
                body: { type: 'calories', payloads: ingredients }
            });

            if (error) throw new Error(error.message);
            if (data && data.edge_error) throw new Error(data.edge_error);

            if (data && data.calories) {
                document.getElementById('edit-calories').value = data.calories;
                // Flash success color briefly
                btn.style.background = '#4CAF50';
                btn.innerHTML = '✨ Success!';
                setTimeout(() => {
                    btn.innerHTML = oldHtml;
                    btn.style.background = '#FF9800';
                }, 2000);
            } else {
                throw new Error("AI Did not return a valid calorie metric.");
            }
        } catch (e) {
            console.error(e);
            alert("AI Calorie Calculation Failed: " + e.message);
            btn.innerHTML = oldHtml;
        } finally {
            btn.style.pointerEvents = 'all';
        }
    }
}; // EOF

// Bootstrap the application on script load
document.addEventListener('DOMContentLoaded', () => {
    adminApp.init();
});

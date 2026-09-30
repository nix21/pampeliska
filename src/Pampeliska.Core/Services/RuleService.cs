using Microsoft.EntityFrameworkCore;
using Pampeliska.Core.Data;
using Pampeliska.Core.Domain;

namespace Pampeliska.Core.Services;

public record ConditionDto2(RuleField Field, RuleOp Op, string Value);

public record RuleInput(
    List<ConditionDto2>? Conditions = null,
    RuleLogic? Logic = null,
    int? CategoryId = null,
    NeedType? NeedOverride = null,
    bool SetNeed = false,
    int? MemberId = null,
    bool SetMember = false,
    bool? ExcludeFromStats = null,
    bool? MarkRecurring = null,
    bool? Enabled = null,
    /// <summary>Pozice 1 = nahoře (nejvyšší priorita). Null u nového = na konec.</summary>
    int? Position = null,
    RuleSource? Source = null);

public record RuleConflict(int RuleId, int Position, bool Overrides);

public record RuleDto(int Id, int Position, RuleLogic Logic, bool Enabled, RuleSource Source, int CategoryId, NeedType? NeedOverride, int? MemberId,
    bool ExcludeFromStats, bool MarkRecurring, IReadOnlyList<ConditionDto2> Conditions, string Description, int Matches, IReadOnlyList<int> Monthly,
    DateOnly? LastUsed, DateTimeOffset CreatedAt, DateTimeOffset? DisabledAt, IReadOnlyList<RuleConflict> Conflicts);

public record RuleTestMatch(int TransactionId, DateOnly Date, TimeOnly? Time, string Counterparty, decimal Amount, string Currency, int AccountId,
    int? CurrentCategoryId, string Note, bool WillChange);

public record RuleTestResult(int Matches, int Changes, IReadOnlyList<RuleTestMatch> Sample);

public record RuleSuggestion(string Pattern, int CategoryId, int Count, int Total, string Reason);

/// <summary>Pravidla kategorizace: CRUD, pořadí, test na historii, zpětné použití, konflikty, statistiky a návrhy.</summary>
public class RuleService(AppDbContext db, TimeProvider time)
{
    public const int HistoryMonths = 6;

    private Task<List<Rule>> AllRulesAsync(bool tracking = false) =>
        (tracking ? db.Rules : db.Rules.AsNoTracking()).Include(r => r.Conditions).OrderBy(r => r.Priority).ToListAsync();

    private DateOnly HistoryFrom => time.Today().AddMonths(-HistoryMonths);

    private Task<List<Transaction>> HistoryAsync() =>
        db.Transactions.AsNoTracking().Include(t => t.Splits)
            .Where(t => t.Date >= HistoryFrom && (t.BetweenMembers || t.Kind != TransactionKind.Transfer && t.Kind != TransactionKind.InvestmentTransfer && t.Kind != TransactionKind.Correction))
            .ToListAsync();

    public async Task<List<RuleDto>> ListAsync()
    {
        var rules = await AllRulesAsync();
        var history = await HistoryAsync();
        var today = time.Today();
        var monthStart = new DateOnly(today.Year, today.Month, 1);
        var accounts = await db.Accounts.AsNoTracking().ToDictionaryAsync(a => a.Id, a => a.Name);
        var applied = history.Where(t => t.AppliedRuleId != null).ToLookup(t => t.AppliedRuleId!.Value);
        var conflicts = DetectConflicts(rules, history);
        return rules.Select((r, i) =>
        {
            var hits = applied[r.Id].ToList();
            var monthly = Enumerable.Range(0, HistoryMonths).Select(k =>
            {
                var m = monthStart.AddMonths(k - HistoryMonths + 1);
                return hits.Count(t => t.Date.Year == m.Year && t.Date.Month == m.Month);
            }).ToList();
            return new RuleDto(r.Id, i + 1, r.Logic, r.Enabled, r.Source, r.CategoryId, r.NeedOverride, r.MemberId, r.ExcludeFromStats, r.MarkRecurring,
                r.Conditions.OrderBy(c => c.SortOrder).Select(c => new ConditionDto2(c.Field, c.Op, c.Value)).ToList(),
                RuleEngine.Describe(r, id => accounts.GetValueOrDefault(id)), hits.Count, monthly,
                hits.Count > 0 ? hits.Max(t => t.Date) : null, r.CreatedAt, r.DisabledAt,
                conflicts.GetValueOrDefault(r.Id)?.Select(o => new RuleConflict(o, rules.FindIndex(x => x.Id == o) + 1,
                    rules.FindIndex(x => x.Id == o) < i)).ToList() ?? []);
        }).ToList();
    }

    /// <summary>Pravidla, která na stejné platbě historie míří do různých kategorií.</summary>
    public static Dictionary<int, HashSet<int>> DetectConflicts(IReadOnlyList<Rule> rules, IEnumerable<Transaction> history)
    {
        var result = new Dictionary<int, HashSet<int>>();
        var enabled = rules.Where(r => r.Enabled).ToList();
        foreach (var t in history)
        {
            var matching = enabled.Where(r => RuleEngine.Matches(r, t)).ToList();
            if (matching.Select(r => r.CategoryId).Distinct().Count() < 2) continue;
            foreach (var a in matching)
                foreach (var b in matching.Where(b => b.Id != a.Id && b.CategoryId != a.CategoryId))
                    (result.TryGetValue(a.Id, out var set) ? set : result[a.Id] = []).Add(b.Id);
        }
        return result;
    }

    private static Rule Build(RuleInput input, Rule? rule = null)
    {
        rule ??= new Rule();
        if (input.Conditions is { } conds)
        {
            rule.Conditions.Clear();
            var i = 0;
            foreach (var c in conds) rule.Conditions.Add(new RuleCondition { Field = c.Field, Op = c.Op, Value = c.Value?.Trim() ?? "", SortOrder = i++ });
        }
        if (input.Logic is { } logic) rule.Logic = logic;
        if (input.CategoryId is { } cat) rule.CategoryId = cat;
        if (input.SetNeed) rule.NeedOverride = input.NeedOverride is NeedType.Inherit ? null : input.NeedOverride;
        if (input.SetMember) rule.MemberId = input.MemberId;
        if (input.ExcludeFromStats is { } ex) rule.ExcludeFromStats = ex;
        if (input.MarkRecurring is { } mr) rule.MarkRecurring = mr;
        return rule;
    }

    private async Task ValidateRefsAsync(Rule rule)
    {
        RuleEngine.Validate(rule);
        if (!await db.Categories.AnyAsync(c => c.Id == rule.CategoryId)) throw new DomainException($"Kategorie {rule.CategoryId} neexistuje.");
        if (rule.MemberId is { } m && !await db.Members.AnyAsync(x => x.Id == m)) throw new DomainException($"Člen {m} neexistuje.");
        foreach (var c in rule.Conditions.Where(c => c.Field == RuleField.Account))
            if (!await db.Accounts.AnyAsync(a => a.Id == int.Parse(c.Value))) throw new DomainException($"Účet {c.Value} neexistuje.");
    }

    public async Task<Rule> CreateAsync(RuleInput input)
    {
        if (input.CategoryId is null) throw new DomainException("Pravidlo musí mít cílovou kategorii.");
        var rule = Build(input);
        rule.Source = input.Source ?? RuleSource.Manual;
        rule.Enabled = input.Enabled ?? true;
        rule.CreatedAt = time.GetUtcNow();
        await ValidateRefsAsync(rule);
        var rules = await AllRulesAsync(tracking: true);
        var pos = Math.Clamp((input.Position ?? rules.Count + 1) - 1, 0, rules.Count);
        rules.Insert(pos, rule);
        Renumber(rules);
        db.Rules.Add(rule);
        await db.SaveChangesAsync();
        return rule;
    }

    public async Task<Rule> UpdateAsync(int id, RuleInput input)
    {
        var rules = await AllRulesAsync(tracking: true);
        var rule = rules.FirstOrDefault(r => r.Id == id) ?? throw new DomainException($"Pravidlo {id} neexistuje.");
        Build(input, rule);
        if (input.Enabled is { } en && en != rule.Enabled)
        {
            rule.Enabled = en;
            rule.DisabledAt = en ? null : time.GetUtcNow();
        }
        await ValidateRefsAsync(rule);
        if (input.Position is { } p)
        {
            rules.Remove(rule);
            rules.Insert(Math.Clamp(p - 1, 0, rules.Count), rule);
            Renumber(rules);
        }
        await db.SaveChangesAsync();
        return rule;
    }

    public async Task MoveAsync(int id, int position) => await UpdateAsync(id, new RuleInput(Position: position));

    public async Task DeleteAsync(int id)
    {
        var rules = await AllRulesAsync(tracking: true);
        var rule = rules.FirstOrDefault(r => r.Id == id) ?? throw new DomainException($"Pravidlo {id} neexistuje.");
        foreach (var t in await db.Transactions.Where(t => t.AppliedRuleId == id).ToListAsync()) t.AppliedRuleId = null;
        rules.Remove(rule);
        db.Rules.Remove(rule);
        Renumber(rules);
        await db.SaveChangesAsync();
    }

    private static void Renumber(List<Rule> rules)
    {
        for (var i = 0; i < rules.Count; i++) rules[i].Priority = i + 1;
    }

    /// <summary>Test (i neuloženého) pravidla na platbách za posledních 6 měsíců.</summary>
    public async Task<RuleTestResult> TestAsync(RuleInput draft, int? ruleId = null, int sample = 8)
    {
        var rules = await AllRulesAsync();
        var existing = ruleId is { } rid ? rules.FirstOrDefault(r => r.Id == rid) : null;
        var rule = Build(draft with { Conditions = draft.Conditions ?? existing?.Conditions.Select(c => new ConditionDto2(c.Field, c.Op, c.Value)).ToList() },
            new Rule { Id = existing?.Id ?? -1, Logic = draft.Logic ?? existing?.Logic ?? RuleLogic.And, CategoryId = draft.CategoryId ?? existing?.CategoryId ?? 0, Enabled = true });
        if (rule.Conditions.Count == 0) return new RuleTestResult(0, 0, []);
        rules.RemoveAll(r => r.Id == rule.Id);
        var pos = Math.Clamp((draft.Position ?? (existing is null ? rules.Count + 1 : existing.Priority)) - 1, 0, rules.Count);
        rules.Insert(pos, rule);
        var cats = await db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name);
        var history = (await HistoryAsync()).Where(t => RuleEngine.Matches(rule, t)).OrderByDescending(t => t.Date).ToList();
        var matches = new List<RuleTestMatch>();
        var changes = 0;
        foreach (var t in history)
        {
            var winner = RuleEngine.FirstMatch(rules, t);
            string note;
            var change = false;
            if (winner is not null && winner.Id != rule.Id) note = $"vyhraje pravidlo {rules.IndexOf(winner) + 1}";
            else if (!RuleEngine.CanApplyTo(t)) note = t.IsSplit ? "rozdělená platba, nezmění se" : "zařazeno ručně, nezmění se";
            else if (t.CategoryId == rule.CategoryId) note = "beze změny";
            else
            {
                change = true;
                note = $"{(t.CategoryId is { } c ? cats.GetValueOrDefault(c) ?? "?" : "nezařazeno")} → {cats.GetValueOrDefault(rule.CategoryId) ?? "?"}";
            }
            if (change) changes++;
            if (matches.Count < sample)
                matches.Add(new RuleTestMatch(t.Id, t.Date, t.Time, t.Counterparty, t.Amount, t.Currency, t.AccountId, t.CategoryId, note, change));
        }
        return new RuleTestResult(history.Count, changes, matches);
    }

    /// <summary>Použije pravidlo na existující platby (kromě ručně zařazených), kde je první shodou.</summary>
    public async Task<int> ApplyToHistoryAsync(int ruleId, bool onlyUnconfirmed = false)
    {
        var rules = await AllRulesAsync();
        var rule = rules.FirstOrDefault(r => r.Id == ruleId) ?? throw new DomainException($"Pravidlo {ruleId} neexistuje.");
        if (!rule.Enabled) throw new DomainException("Vypnuté pravidlo nelze použít.");
        var txs = await db.Transactions.Include(t => t.Splits).Include(t => t.Shares)
            .Where(t => t.Kind == TransactionKind.Expense || t.Kind == TransactionKind.Income || t.Kind == TransactionKind.Refund)
            .Where(t => t.CategorySource != CategorySource.Manual && !t.Splits.Any())
            .Where(t => !onlyUnconfirmed || t.Status == TransactionStatus.Suggested)
            .ToListAsync();
        var now = time.GetUtcNow();
        var n = 0;
        foreach (var t in txs)
        {
            if (!RuleEngine.Matches(rule, t) || RuleEngine.FirstMatch(rules, t)?.Id != rule.Id) continue;
            if (t.CategoryId == rule.CategoryId && t.AppliedRuleId == rule.Id) continue;
            RuleEngine.Apply(rule, t);
            t.Events.Add(new TransactionEvent { At = now, Actor = "Pravidla", Text = $"Pravidlo „{RuleEngine.Describe(rule)}“ použito zpětně" });
            n++;
        }
        await db.SaveChangesAsync();
        return n;
    }

    /// <summary>Pravidlo „Obchodník obsahuje X → kategorie“ z ručně zařazené platby (fronta, Výdaje).</summary>
    public async Task<Rule?> CreateFromTransactionAsync(Transaction t, int categoryId, RuleSource source, bool applyToHistory)
    {
        var key = Text.MerchantKey(t.Counterparty);
        ConditionDto2 cond = key.Length >= 3
            ? new(RuleField.Merchant, RuleOp.Contains, key.ToUpperInvariant())
            : AccountNumber.Normalize(t.CounterpartyAccount) is { } acc ? new(RuleField.CounterpartyAccount, RuleOp.Eq, acc)
            : throw new DomainException("Z této platby nejde pravidlo odvodit – chybí obchodník i protiúčet.");
        var rules = await AllRulesAsync();
        if (rules.Any(r => r.CategoryId == categoryId && r.Conditions.Count == 1 && r.Conditions[0].Field == cond.Field
                           && Text.Normalize(r.Conditions[0].Value) == Text.Normalize(cond.Value)))
            return null;
        var rule = await CreateAsync(new RuleInput([cond], RuleLogic.And, categoryId, Source: source));
        if (applyToHistory) await ApplyToHistoryAsync(rule.Id);
        return rule;
    }

    /// <summary>Návrhy nových pravidel: stejný obchodník ručně zařazený aspoň 3× do stejné kategorie.</summary>
    public async Task<List<RuleSuggestion>> SuggestionsAsync(int take = 5)
    {
        if (!(await db.Households.AsNoTracking().FirstAsync()).Settings.SuggestRules) return [];
        var rules = await AllRulesAsync();
        var dismissed = (await db.RuleSuggestionDismissals.AsNoTracking().ToListAsync()).Select(d => (d.Pattern, d.CategoryId)).ToHashSet();
        var manual = await db.Transactions.AsNoTracking()
            .Where(t => t.CategorySource == CategorySource.Manual && t.CategoryId != null && !t.Splits.Any()
                        && (t.Kind == TransactionKind.Expense || t.Kind == TransactionKind.Income))
            .Select(t => new { t.Counterparty, t.CategoryId, t.Message, t.RawText, t.AccountId, t.Amount, t.AmountCzk, t.Currency, t.Time, t.Mcc, t.CounterpartyAccount })
            .ToListAsync();
        var cats = await db.Categories.AsNoTracking().ToDictionaryAsync(c => c.Id, c => c.Name);
        var result = new List<RuleSuggestion>();
        foreach (var g in manual.GroupBy(t => Text.MerchantKey(t.Counterparty)).Where(g => g.Key.Length >= 3))
        {
            var byCat = g.GroupBy(t => t.CategoryId!.Value).OrderByDescending(x => x.Count()).First();
            if (byCat.Count() < 3) continue;
            var pattern = g.Key.ToUpperInvariant();
            if (dismissed.Contains((pattern, byCat.Key))) continue;
            var sample = new Transaction { Counterparty = g.First().Counterparty, AccountId = g.First().AccountId, Amount = g.First().Amount };
            var covered = RuleEngine.FirstMatch(rules, sample);
            if (covered is not null && covered.CategoryId == byCat.Key) continue;
            var total = g.Count();
            var reason = total == byCat.Count()
                ? $"{byCat.Count()} {Plural(byCat.Count())}, vždy {cats.GetValueOrDefault(byCat.Key)}"
                : $"{byCat.Count()}× {cats.GetValueOrDefault(byCat.Key)}, {total - byCat.Count()}× jinam";
            result.Add(new RuleSuggestion(pattern, byCat.Key, byCat.Count(), total, reason));
        }
        return result.OrderByDescending(r => r.Count).Take(take).ToList();
    }

    private static string Plural(int n) => n == 1 ? "platba" : n is >= 2 and <= 4 ? "platby" : "plateb";

    public async Task<Rule> AcceptSuggestionAsync(string pattern, int categoryId)
    {
        var rule = await CreateAsync(new RuleInput([new ConditionDto2(RuleField.Merchant, RuleOp.Contains, pattern)], RuleLogic.And, categoryId, Source: RuleSource.Ai));
        await ApplyToHistoryAsync(rule.Id, onlyUnconfirmed: true);
        return rule;
    }

    public async Task DismissSuggestionAsync(string pattern, int categoryId)
    {
        db.RuleSuggestionDismissals.Add(new RuleSuggestionDismissal { Pattern = pattern, CategoryId = categoryId });
        await db.SaveChangesAsync();
    }
}

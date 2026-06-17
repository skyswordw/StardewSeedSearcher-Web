#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
  dotnet,
  ensureDir,
  ensureDotnet,
  ensureUpstream,
  output,
  prepareOracleProject,
  root,
  upstreamDir,
} from './oracle-env.mjs'

const fixturePath = resolve(root, 'src/search-core/__fixtures__/oracle-sample.json')
const checkMode = process.argv.includes('--check')

function patchProject() {
  prepareOracleProject(
    'StardewSeedSearcher.OracleFixtureRunner',
    'OracleFixtureRunner.cs',
    oracleRunnerSource,
  )
}

function generateFixtureJson() {
  const project = resolve(upstreamDir, 'StardewSeedSearcher/StardewSeedSearcher.csproj')
  const rawOutput = output(dotnet, ['run', '--project', project, '--configuration', 'Release', '--no-launch-profile'], {
    cwd: upstreamDir,
    maxBuffer: 1024 * 1024 * 16,
  })
  const jsonStart = rawOutput.indexOf('{\n  "meta"')
  if (jsonStart < 0) {
    throw new Error(`Could not locate oracle JSON in dotnet output:\n${rawOutput}`)
  }
  const json = rawOutput.slice(jsonStart)
  JSON.parse(json)
  return `${json.trim()}\n`
}

function generateFixture() {
  const json = generateFixtureJson()
  if (checkMode) {
    const current = readFileSync(fixturePath, 'utf8')
    if (current !== json) {
      throw new Error(`${fixturePath} is out of date. Run npm run fixtures:generate.`)
    }
    console.log(`Fixture is up to date: ${fixturePath}`)
    return
  }

  ensureDir(dirname(fixturePath))
  writeFileSync(fixturePath, json)
  console.log(`Wrote ${fixturePath}`)
}

function main() {
  ensureDotnet()
  ensureUpstream()
  patchProject()
  generateFixture()
}

const oracleRunnerSource = String.raw`using System.Text.Json;
using StardewSeedSearcher.Core;
using StardewSeedSearcher.Data;
using StardewSeedSearcher.Features;

namespace StardewSeedSearcher;

public static class OracleFixtureRunner
{
    public static void Main(string[] args)
    {
        TravelingCartData.Initialize();

        var weatherCondition = new WeatherCondition { Season = 0, StartDay = 1, EndDay = 28, MinRainDays = 4 };
        var fairyCondition = new FairyCondition
        {
            StartYear = 1,
            StartSeason = 0,
            StartDay = 1,
            EndYear = 1,
            EndSeason = 2,
            EndDay = 28,
            MinOccurrences = 1
        };
        var mineChestNewCondition = new MineChestPredictor.MineChestCondition { Floor = 10, ItemName = "工作靴" };
        var mineChestLegacyCondition = new MineChestPredictor.MineChestCondition { Floor = 10, ItemName = "木剑" };
        var monsterLevelCondition = new MonsterLevelPredictor.MonsterLevelCondition
        {
            StartSeason = 0,
            StartDay = 5,
            EndSeason = 0,
            EndDay = 5,
            StartLevel = 1,
            EndLevel = 40
        };
        var cartCondition = new CartCondition
        {
            StartYear = 1,
            StartSeason = 0,
            StartDay = 5,
            EndYear = 1,
            EndSeason = 2,
            EndDay = 28,
            ItemName = "野山葵",
            RequireQty5 = false,
            MinOccurrences = 1
        };
        var fixture = new
        {
            meta = new
            {
                source = "CuiYinYin2023/StardewSeedSearcher",
                commit = "0e7d0df08f14f2c342747ca9a22c90d8edc9d892",
                generatedBy = "tools/oracle/generate-fixtures.mjs",
                schema = "oracle-golden-matrix-v1",
                note = "C# is used only to generate committed parity fixtures."
            },
            primitives = new
            {
                random = new[]
                {
                    new
                    {
                        name = "next-seed-1",
                        seed = 1,
                        operation = "next",
                        min = (int?)null,
                        max = (int?)null,
                        count = 10,
                        expected = RandomNextSequence(1, 10)
                    },
                    new
                    {
                        name = "range-seed-1-2-to-31",
                        seed = 1,
                        operation = "nextRange",
                        min = (int?)2,
                        max = (int?)31,
                        count = 8,
                        expected = RandomRangeSequence(1, 2, 31, 8)
                    },
                    new
                    {
                        name = "negative-seed-next",
                        seed = -12345,
                        operation = "next",
                        min = (int?)null,
                        max = (int?)null,
                        count = 5,
                        expected = RandomNextSequence(-12345, 5)
                    },
                    new
                    {
                        name = "int-min-seed-next",
                        seed = int.MinValue,
                        operation = "next",
                        min = (int?)null,
                        max = (int?)null,
                        count = 5,
                        expected = RandomNextSequence(int.MinValue, 5)
                    }
                },
                hashes = new[]
                {
                    HashStringCase("location_weather"),
                    HashStringCase("summer_rain_chance"),
                    HashStringCase("travelerSkillBook"),
                    HashArrayCase("zero-array", 0, 0, 0, 0, 0),
                    HashArrayCase("mixed-sign-array", -1, 0, 1, int.MaxValue, int.MinValue),
                    HashArrayCase("weather-array", 777, 1, 0, 0, 0),
                    RandomSeedCase("new-weather", 777, 1, 0, 0, 0, false),
                    RandomSeedCase("legacy-weather", 777, 1, 0, 0, 0, true),
                    RandomSeedCase("new-mod-boundary", int.MinValue, -17, 99, 0, int.MaxValue, false),
                    RandomSeedCase("legacy-mod-boundary", int.MinValue, -17, 99, 0, int.MaxValue, true)
                },
                dates = new
                {
                    toAbsolute = new[]
                    {
                        DateToAbsoluteCase("y1-spring-1", 1, 0, 1),
                        DateToAbsoluteCase("y1-winter-28", 1, 3, 28),
                        DateToAbsoluteCase("y2-spring-1", 2, 0, 1),
                        DateToAbsoluteCase("y3-winter-28", 3, 3, 28)
                    },
                    fromAbsolute = new[]
                    {
                        AbsoluteToDateCase(1),
                        AbsoluteToDateCase(84),
                        AbsoluteToDateCase(112),
                        AbsoluteToDateCase(113),
                        AbsoluteToDateCase(336)
                    }
                }
            },
            predictorCases = new object[]
            {
                PredictorCase("weather-seed-1-new", "weather", 1, false, new { weatherConditions = new[] { WeatherConditionObject(weatherCondition) } }, WeatherDetail(1, false)),
                PredictorCase("weather-seed-1-legacy", "weather", 1, true, new { weatherConditions = new[] { WeatherConditionObject(weatherCondition) } }, WeatherDetail(1, true)),
                PredictorCase("mine-chest-floor-10-new", "mineChest", 1, false, new { mineChestConditions = new[] { MineChestConditionObject(mineChestNewCondition) } }, MineChestDetail(1, new[] { mineChestNewCondition }, false)),
                PredictorCase("mine-chest-floor-10-legacy", "mineChest", 1, true, new { mineChestConditions = new[] { MineChestConditionObject(mineChestLegacyCondition) } }, MineChestDetail(1, new[] { mineChestLegacyCondition }, true)),
                PredictorCase("desert-festival-seed-1-new", "desertFestival", 1, false, new { desertFestivalCondition = new { requireJas = false, requireLeah = false } }, DesertFestivalDetail(1, false)),
                PredictorCase("desert-festival-seed-1-legacy", "desertFestival", 1, true, new { desertFestivalCondition = new { requireJas = false, requireLeah = false } }, DesertFestivalDetail(1, true)),
                PredictorCase("fairy-seed-17-new", "fairy", 17, false, new { fairyConditions = new[] { FairyConditionObject(fairyCondition) } }, FairyDetail(17, new[] { fairyCondition }, false)),
                PredictorCase("fairy-seed-137-legacy", "fairy", 137, true, new { fairyConditions = new[] { FairyConditionObject(fairyCondition) } }, FairyDetail(137, new[] { fairyCondition }, true)),
                PredictorCase("monster-level-spring-5-new", "monsterLevel", 1, false, new { monsterLevelConditions = new[] { MonsterLevelConditionObject(monsterLevelCondition) } }, MonsterLevelDetail(1, new[] { monsterLevelCondition }, false)),
                PredictorCase("monster-level-spring-5-legacy", "monsterLevel", 1, true, new { monsterLevelConditions = new[] { MonsterLevelConditionObject(monsterLevelCondition) } }, MonsterLevelDetail(1, new[] { monsterLevelCondition }, true)),
                PredictorCase("cart-wild-horseradish-new", "cart", 2, false, new { cartConditions = new[] { CartConditionObject(cartCondition) } }, CartDetail(2, new[] { cartCondition }, false)),
                PredictorCase("cart-wild-horseradish-legacy", "cart", 2, true, new { cartConditions = new[] { CartConditionObject(cartCondition) } }, CartDetail(2, new[] { cartCondition }, true))
            },
            searchCases = new object[]
            {
                SearchCase(
                    "weather-spring-rain-4-new",
                    new SearchSpec(
                        StartSeed: 1,
                        EndSeed: 500,
                        UseLegacyRandom: false,
                        WeatherConditions: new[] { weatherCondition },
                        FairyConditions: Array.Empty<FairyCondition>(),
                        MineChestConditions: Array.Empty<MineChestPredictor.MineChestCondition>(),
                        MonsterLevelConditions: Array.Empty<MonsterLevelPredictor.MonsterLevelCondition>(),
                        DesertFestivalCondition: null,
                        CartConditions: Array.Empty<CartCondition>(),
                        OutputLimit: 3
                    )
                ),
                SearchCase(
                    "weather-spring-rain-4-legacy",
                    new SearchSpec(
                        StartSeed: 1,
                        EndSeed: 500,
                        UseLegacyRandom: true,
                        WeatherConditions: new[] { weatherCondition },
                        FairyConditions: Array.Empty<FairyCondition>(),
                        MineChestConditions: Array.Empty<MineChestPredictor.MineChestCondition>(),
                        MonsterLevelConditions: Array.Empty<MonsterLevelPredictor.MonsterLevelCondition>(),
                        DesertFestivalCondition: null,
                        CartConditions: Array.Empty<CartCondition>(),
                        OutputLimit: 3
                    )
                ),
                SearchCase(
                    "weather-and-mine-chest-new",
                    new SearchSpec(
                        StartSeed: 1,
                        EndSeed: 1000,
                        UseLegacyRandom: false,
                        WeatherConditions: new[] { weatherCondition },
                        FairyConditions: Array.Empty<FairyCondition>(),
                        MineChestConditions: new[] { mineChestNewCondition },
                        MonsterLevelConditions: Array.Empty<MonsterLevelPredictor.MonsterLevelCondition>(),
                        DesertFestivalCondition: null,
                        CartConditions: Array.Empty<CartCondition>(),
                        OutputLimit: 5
                    )
                ),
                SearchCase(
                    "weather-and-desert-festival-legacy",
                    new SearchSpec(
                        StartSeed: 1,
                        EndSeed: 2000,
                        UseLegacyRandom: true,
                        WeatherConditions: new[] { weatherCondition },
                        FairyConditions: Array.Empty<FairyCondition>(),
                        MineChestConditions: Array.Empty<MineChestPredictor.MineChestCondition>(),
                        MonsterLevelConditions: Array.Empty<MonsterLevelPredictor.MonsterLevelCondition>(),
                        DesertFestivalCondition: new DesertFestivalSpec(RequireJas: false, RequireLeah: true),
                        CartConditions: Array.Empty<CartCondition>(),
                        OutputLimit: 5
                    )
                ),
                UpstreamFeedbackSearchCase("upstream-feedback-mixed-heavy-false-positive-window", 175000, 176000),
                UpstreamFeedbackSearchCase("upstream-feedback-mixed-heavy-first-match-window", 2373000, 2373100),
                UpstreamFeedbackSearchCase("upstream-feedback-mixed-heavy-second-match-window", 2381150, 2381250),
                UpstreamFeedbackSearchCase("upstream-feedback-mixed-heavy-twentieth-match-window", 12526100, 12526250)
            }
        };

        Console.WriteLine(JsonSerializer.Serialize(fixture, new JsonSerializerOptions { WriteIndented = true }));
    }

    private static int[] RandomNextSequence(int seed, int count)
    {
        var rng = new Random(seed);
        return Enumerable.Range(0, count).Select(_ => rng.Next()).ToArray();
    }

    private static int[] RandomRangeSequence(int seed, int min, int max, int count)
    {
        var rng = new Random(seed);
        return Enumerable.Range(0, count).Select(_ => rng.Next(min, max)).ToArray();
    }

    private static object DateObject((int year, int season, int day) date) =>
        new { date.year, date.season, date.day };

    private static object HashStringCase(string value) =>
        new { kind = "string", value, expected = HashHelper.GetHashFromString(value) };

    private static object HashArrayCase(string name, params int[] values) =>
        new { kind = "array", name, values, expected = HashHelper.GetHashFromArray(values) };

    private static object RandomSeedCase(string name, int a, int b, int c, int d, int e, bool useLegacyRandom) =>
        new
        {
            kind = "randomSeed",
            name,
            values = new[] { a, b, c, d, e },
            useLegacyRandom,
            expected = HashHelper.GetRandomSeed(a, b, c, d, e, useLegacyRandom)
        };

    private static object DateToAbsoluteCase(string name, int year, int season, int day) =>
        new
        {
            name,
            input = new { year, season, day },
            expected = TimeHelper.DateToAbsoluteDay(year, season, day)
        };

    private static object AbsoluteToDateCase(int absoluteDay) =>
        new
        {
            absoluteDay,
            expected = DateObject(TimeHelper.AbsoluteDaytoDate(absoluteDay))
        };

    private static object PredictorCase(string name, string kind, int seed, bool useLegacyRandom, object input, object expected) =>
        new { name, kind, seed, useLegacyRandom, input, expected };

    private static object WeatherDetail(int seed, bool legacy)
    {
        var predictor = new WeatherPredictor();
        var detail = WeatherPredictor.ExtractWeatherDetail(
            predictor.PredictWeatherWithDetail(seed, legacy).weather,
            predictor.PredictWeatherWithDetail(seed, legacy).greenRainDay
        );
        return new
        {
            springRain = detail.SpringRain,
            summerRain = detail.SummerRain,
            fallRain = detail.FallRain,
            greenRainDay = detail.GreenRainDay
        };
    }

    private static object MineChestDetail(int seed, IEnumerable<MineChestPredictor.MineChestCondition> conditions, bool legacy)
    {
        var predictor = new MineChestPredictor { IsEnabled = true };
        predictor.Conditions.AddRange(conditions);
        return predictor.GetDetails(seed, legacy);
    }

    private static object DesertFestivalDetail(int seed, bool legacy)
    {
        return new DesertFestivalPredictor().GetDetails(seed, legacy);
    }

    private static object FairyDetail(int seed, IEnumerable<FairyCondition> conditions, bool legacy)
    {
        var predictor = new FairyPredictor { IsEnabled = true };
        predictor.Conditions.AddRange(conditions);
        return new { days = predictor.GetFairyDays(seed, legacy) };
    }

    private static object MonsterLevelDetail(int seed, IEnumerable<MonsterLevelPredictor.MonsterLevelCondition> conditions, bool legacy)
    {
        var predictor = new MonsterLevelPredictor { IsEnabled = true };
        predictor.Conditions.AddRange(conditions);
        return predictor.GetDetails(seed, legacy);
    }

    private static object CartDetail(int seed, IEnumerable<CartCondition> conditions, bool legacy)
    {
        var predictor = new TravelingCartPredictor { IsEnabled = true };
        predictor.Conditions.AddRange(conditions);
        var matches = predictor.GetCartMatches(seed, legacy)
            .Cast<CartDayMatch>()
            .Select(match => new
            {
                year = match.Year,
                season = match.Season,
                day = match.Day,
                absoluteDay = match.AbsoluteDay,
                itemName = match.ItemName,
                quantity = match.Quantity,
                price = match.Price
            })
            .ToArray();
        return new { matches };
    }

    private static object SearchCase(string name, SearchSpec spec)
    {
        return new
        {
            name,
            request = SearchRequestObject(spec),
            expected = Search(spec)
        };
    }

    private static object UpstreamFeedbackSearchCase(string name, int startSeed, int endSeed)
    {
        return SearchCase(
            name,
            new SearchSpec(
                StartSeed: startSeed,
                EndSeed: endSeed,
                UseLegacyRandom: false,
                WeatherConditions: new[] { new WeatherCondition { Season = 0, StartDay = 1, EndDay = 28, MinRainDays = 10 } },
                FairyConditions: new[]
                {
                    new FairyCondition
                    {
                        StartYear = 1,
                        StartSeason = 0,
                        StartDay = 1,
                        EndYear = 1,
                        EndSeason = 0,
                        EndDay = 28,
                        MinOccurrences = 2
                    }
                },
                MineChestConditions: new[] { new MineChestPredictor.MineChestCondition { Floor = 110, ItemName = "巨锤" } },
                MonsterLevelConditions: new[]
                {
                    new MonsterLevelPredictor.MonsterLevelCondition
                    {
                        StartSeason = 0,
                        StartDay = 5,
                        EndSeason = 0,
                        EndDay = 5,
                        StartLevel = 1,
                        EndLevel = 40
                    }
                },
                DesertFestivalCondition: new DesertFestivalSpec(RequireJas: true, RequireLeah: false),
                CartConditions: new[]
                {
                    new CartCondition
                    {
                        StartYear = 1,
                        StartSeason = 0,
                        StartDay = 5,
                        EndYear = 1,
                        EndSeason = 2,
                        EndDay = 28,
                        ItemName = "电池组",
                        RequireQty5 = false,
                        MinOccurrences = 1
                    }
                },
                OutputLimit: 20
            )
        );
    }

    private static int[] Search(SearchSpec spec)
    {
        var features = InitializeFeatures(spec);
        var sortedFeatures = features.OrderBy(feature => feature.EstimateCost(spec.UseLegacyRandom)).ToList();
        var results = new List<int>();

        for (var seed = spec.StartSeed; seed <= spec.EndSeed; seed++)
        {
            var allMatch = true;
            foreach (var feature in sortedFeatures)
            {
                if (!feature.Check(seed, spec.UseLegacyRandom))
                {
                    allMatch = false;
                    break;
                }
            }

            if (!allMatch) continue;
            results.Add(seed);
            if (results.Count >= spec.OutputLimit) break;
        }

        return results.ToArray();
    }

    private static List<ISearchFeature> InitializeFeatures(SearchSpec spec)
    {
        var features = new List<ISearchFeature>();

        if (spec.WeatherConditions.Length > 0)
        {
            var predictor = new WeatherPredictor { IsEnabled = true };
            predictor.Conditions.AddRange(spec.WeatherConditions);
            features.Add(predictor);
        }
        if (spec.FairyConditions.Length > 0)
        {
            var predictor = new FairyPredictor { IsEnabled = true };
            predictor.Conditions.AddRange(spec.FairyConditions);
            features.Add(predictor);
        }
        if (spec.MineChestConditions.Length > 0)
        {
            var predictor = new MineChestPredictor { IsEnabled = true };
            predictor.Conditions.AddRange(spec.MineChestConditions);
            features.Add(predictor);
        }
        if (spec.MonsterLevelConditions.Length > 0)
        {
            var predictor = new MonsterLevelPredictor { IsEnabled = true };
            predictor.Conditions.AddRange(spec.MonsterLevelConditions);
            features.Add(predictor);
        }
        if (spec.DesertFestivalCondition is not null && (spec.DesertFestivalCondition.RequireJas || spec.DesertFestivalCondition.RequireLeah))
        {
            features.Add(new DesertFestivalPredictor
            {
                IsEnabled = true,
                RequireJas = spec.DesertFestivalCondition.RequireJas,
                RequireLeah = spec.DesertFestivalCondition.RequireLeah
            });
        }
        if (spec.CartConditions.Length > 0)
        {
            var predictor = new TravelingCartPredictor { IsEnabled = true };
            predictor.Conditions.AddRange(spec.CartConditions);
            features.Add(predictor);
        }

        return features;
    }

    private static object SearchRequestObject(SearchSpec spec) =>
        new
        {
            startSeed = spec.StartSeed,
            endSeed = spec.EndSeed,
            useLegacyRandom = spec.UseLegacyRandom,
            weatherConditions = spec.WeatherConditions.Select(WeatherConditionObject).ToArray(),
            fairyConditions = spec.FairyConditions.Select(FairyConditionObject).ToArray(),
            mineChestConditions = spec.MineChestConditions.Select(MineChestConditionObject).ToArray(),
            monsterLevelConditions = spec.MonsterLevelConditions.Select(MonsterLevelConditionObject).ToArray(),
            desertFestivalCondition = spec.DesertFestivalCondition is null ? null : new
            {
                requireJas = spec.DesertFestivalCondition.RequireJas,
                requireLeah = spec.DesertFestivalCondition.RequireLeah
            },
            cartConditions = spec.CartConditions.Select(CartConditionObject).ToArray(),
            outputLimit = spec.OutputLimit
        };

    private static object WeatherConditionObject(WeatherCondition condition) =>
        new
        {
            season = condition.Season,
            startDay = condition.StartDay,
            endDay = condition.EndDay,
            minRainDays = condition.MinRainDays
        };

    private static object FairyConditionObject(FairyCondition condition) =>
        new
        {
            startYear = condition.StartYear,
            startSeason = condition.StartSeason,
            startDay = condition.StartDay,
            endYear = condition.EndYear,
            endSeason = condition.EndSeason,
            endDay = condition.EndDay,
            minOccurrences = condition.MinOccurrences
        };

    private static object MineChestConditionObject(MineChestPredictor.MineChestCondition condition) =>
        new
        {
            floor = condition.Floor,
            itemName = condition.ItemName
        };

    private static object MonsterLevelConditionObject(MonsterLevelPredictor.MonsterLevelCondition condition) =>
        new
        {
            startSeason = condition.StartSeason,
            endSeason = condition.EndSeason,
            startDay = condition.StartDay,
            endDay = condition.EndDay,
            startLevel = condition.StartLevel,
            endLevel = condition.EndLevel
        };

    private static object CartConditionObject(CartCondition condition) =>
        new
        {
            startYear = condition.StartYear,
            startSeason = condition.StartSeason,
            startDay = condition.StartDay,
            endYear = condition.EndYear,
            endSeason = condition.EndSeason,
            endDay = condition.EndDay,
            itemName = condition.ItemName,
            requireQty5 = condition.RequireQty5,
            minOccurrences = condition.MinOccurrences
        };

    private record DesertFestivalSpec(bool RequireJas, bool RequireLeah);

    private record SearchSpec(
        int StartSeed,
        int EndSeed,
        bool UseLegacyRandom,
        WeatherCondition[] WeatherConditions,
        FairyCondition[] FairyConditions,
        MineChestPredictor.MineChestCondition[] MineChestConditions,
        MonsterLevelPredictor.MonsterLevelCondition[] MonsterLevelConditions,
        DesertFestivalSpec? DesertFestivalCondition,
        CartCondition[] CartConditions,
        int OutputLimit
    );

    private static int[] SearchWeatherSpringRain4(int start, int end, bool legacy, int limit)
    {
        var predictor = new WeatherPredictor { IsEnabled = true };
        predictor.Conditions.Add(new WeatherCondition { Season = 0, StartDay = 1, EndDay = 28, MinRainDays = 4 });
        var results = new List<int>();
        for (var seed = start; seed <= end; seed++)
        {
            if (predictor.Check(seed, legacy))
            {
                results.Add(seed);
                if (results.Count >= limit) break;
            }
        }
        return results.ToArray();
    }
}
`

main()

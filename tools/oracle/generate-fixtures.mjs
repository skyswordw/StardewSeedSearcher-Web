#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(import.meta.dirname, '../..')
const dotnetDir = resolve(root, '.dotnet')
const dotnet = resolve(dotnetDir, 'dotnet')
const upstreamDir = resolve(root, 'tools/oracle/upstream/StardewSeedSearcher')
const fixturePath = resolve(root, 'src/search-core/__fixtures__/oracle-sample.json')
const upstreamUrl = 'https://github.com/CuiYinYin2023/StardewSeedSearcher.git'
const upstreamCommit = '0e7d0df08f14f2c342747ca9a22c90d8edc9d892'

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: 'inherit',
    env: dotnetEnv(),
    ...options,
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
}

function output(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    encoding: 'utf8',
    env: dotnetEnv(),
    ...options,
  })
  if (result.status !== 0) {
    process.stderr.write(result.stderr)
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}`)
  }
  return result.stdout
}

function dotnetEnv() {
  return {
    ...process.env,
    DOTNET_ROOT: dotnetDir,
    DOTNET_CLI_HOME: resolve(root, '.dotnet-home'),
    DOTNET_NOLOGO: '1',
    DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
    DOTNET_CLI_TELEMETRY_OPTOUT: '1',
    DOTNET_GENERATE_ASPNET_CERTIFICATE: 'false',
    NUGET_PACKAGES: resolve(root, '.nuget/packages'),
    PATH: `${dotnetDir}:${process.env.PATH ?? ''}`,
  }
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true })
}

function ensureDotnet() {
  if (!existsSync(dotnet)) {
    run(process.execPath, ['tools/oracle/install-dotnet.mjs'])
  }
}

function ensureUpstream() {
  if (existsSync(resolve(upstreamDir, '.git'))) {
    run('git', ['fetch', '--depth', '1', 'origin', upstreamCommit], { cwd: upstreamDir })
    run('git', ['checkout', '--detach', upstreamCommit], { cwd: upstreamDir })
    return
  }

  const tmpClone = '/tmp/codex-stardew-seed-searcher'
  if (existsSync(resolve(tmpClone, '.git'))) {
    ensureDir(dirname(upstreamDir))
    rmSync(upstreamDir, { recursive: true, force: true })
    run('git', ['clone', '--depth', '1', 'file:///tmp/codex-stardew-seed-searcher', upstreamDir])
    run('git', ['fetch', '--depth', '1', 'origin', upstreamCommit], { cwd: upstreamDir })
    run('git', ['checkout', '--detach', upstreamCommit], { cwd: upstreamDir })
    return
  }

  ensureDir(dirname(upstreamDir))
  run('git', ['clone', '--depth', '1', upstreamUrl, upstreamDir])
  run('git', ['fetch', '--depth', '1', 'origin', upstreamCommit], { cwd: upstreamDir })
  run('git', ['checkout', '--detach', upstreamCommit], { cwd: upstreamDir })
}

function patchProject() {
  const projectPath = resolve(upstreamDir, 'StardewSeedSearcher/StardewSeedSearcher.csproj')
  const original = readFileSync(projectPath, 'utf8')
  const patched = original.replace(
    '<StartupObject>StardewSeedSearcher.ProgramWeb</StartupObject>',
    '<StartupObject>StardewSeedSearcher.OracleFixtureRunner</StartupObject>',
  )
  writeFileSync(projectPath, patched)

  const runnerPath = resolve(upstreamDir, 'StardewSeedSearcher/OracleFixtureRunner.cs')
  writeFileSync(runnerPath, oracleRunnerSource)
}

function generateFixture() {
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
  ensureDir(dirname(fixturePath))
  writeFileSync(fixturePath, `${json.trim()}\n`)
}

function main() {
  ensureDotnet()
  ensureUpstream()
  patchProject()
  generateFixture()
  console.log(`Wrote ${fixturePath}`)
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

        var fixture = new
        {
            meta = new
            {
                source = "CuiYinYin2023/StardewSeedSearcher",
                commit = "0e7d0df08f14f2c342747ca9a22c90d8edc9d892",
                generatedBy = "tools/oracle/generate-fixtures.mjs"
            },
            primitives = new
            {
                randomSeed1Next = RandomNextSequence(1, 10),
                randomSeed1Range2To31 = RandomRangeSequence(1, 2, 31, 8),
                hashes = new
                {
                    location_weather = HashHelper.GetHashFromString("location_weather"),
                    summer_rain_chance = HashHelper.GetHashFromString("summer_rain_chance"),
                    travelerSkillBook = HashHelper.GetHashFromString("travelerSkillBook"),
                    array_777_1_0_0_0 = HashHelper.GetHashFromArray(777, 1, 0, 0, 0),
                    randomSeedNew_777_1_0_0_0 = HashHelper.GetRandomSeed(777, 1, 0, 0, 0, false),
                    randomSeedLegacy_777_1_0_0_0 = HashHelper.GetRandomSeed(777, 1, 0, 0, 0, true)
                },
                dates = new
                {
                    y1Spring1 = TimeHelper.DateToAbsoluteDay(1, 0, 1),
                    y1Fall28 = TimeHelper.DateToAbsoluteDay(1, 2, 28),
                    y2Spring1 = TimeHelper.DateToAbsoluteDay(2, 0, 1),
                    abs84 = DateObject(TimeHelper.AbsoluteDaytoDate(84)),
                    abs113 = DateObject(TimeHelper.AbsoluteDaytoDate(113))
                }
            },
            predictors = new
            {
                weatherSeed1New = WeatherDetail(1, false),
                weatherSeed1Legacy = WeatherDetail(1, true),
                mineChestSeed1Floor10New = MineChestDetail(1, 10, "皮靴", false),
                mineChestSeed1Floor10Legacy = MineChestDetail(1, 10, "皮靴", true),
                desertFestivalSeed1New = DesertFestivalDetail(1, false),
                desertFestivalSeed1Legacy = DesertFestivalDetail(1, true),
                fairySeed1New = FairyDetail(1, false),
                monsterLevelSeed1New = MonsterLevelDetail(1, false),
                cartSeed1New = CartDetail(1, false)
            },
            searches = new
            {
                weatherSpringRain4Seeds1To500New = SearchWeatherSpringRain4(1, 500, false, 3),
                weatherSpringRain4Seeds1To500Legacy = SearchWeatherSpringRain4(1, 500, true, 3)
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

    private static object MineChestDetail(int seed, int floor, string itemName, bool legacy)
    {
        var predictor = new MineChestPredictor { IsEnabled = true };
        predictor.Conditions.Add(new MineChestPredictor.MineChestCondition { Floor = floor, ItemName = itemName });
        return predictor.GetDetails(seed, legacy);
    }

    private static object DesertFestivalDetail(int seed, bool legacy)
    {
        return new DesertFestivalPredictor().GetDetails(seed, legacy);
    }

    private static object FairyDetail(int seed, bool legacy)
    {
        var predictor = new FairyPredictor { IsEnabled = true };
        predictor.Conditions.Add(new FairyCondition
        {
            StartYear = 1,
            StartSeason = 0,
            StartDay = 1,
            EndYear = 1,
            EndSeason = 2,
            EndDay = 28,
            MinOccurrences = 1
        });
        return new { days = predictor.GetFairyDays(seed, legacy) };
    }

    private static object MonsterLevelDetail(int seed, bool legacy)
    {
        var predictor = new MonsterLevelPredictor { IsEnabled = true };
        predictor.Conditions.Add(new MonsterLevelPredictor.MonsterLevelCondition
        {
            StartSeason = 0,
            StartDay = 5,
            EndSeason = 0,
            EndDay = 5,
            StartLevel = 1,
            EndLevel = 40
        });
        return predictor.GetDetails(seed, legacy);
    }

    private static object CartDetail(int seed, bool legacy)
    {
        var itemName = TravelingCartData.OptimizedItems.First(item => item.IsEligible).Name;
        var predictor = new TravelingCartPredictor { IsEnabled = true };
        predictor.Conditions.Add(new CartCondition
        {
            StartYear = 1,
            StartSeason = 0,
            StartDay = 5,
            EndYear = 1,
            EndSeason = 2,
            EndDay = 28,
            ItemName = itemName,
            RequireQty5 = false,
            MinOccurrences = 1
        });
        return new { itemName, matches = predictor.GetCartMatches(seed, legacy) };
    }

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

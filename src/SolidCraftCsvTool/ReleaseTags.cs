namespace SolidCraftCsvTool;

internal static class ReleaseTags
{
    internal static bool TryParseVersion(string? tag,out Version version)
    {
        version=null!;
        if(string.IsNullOrWhiteSpace(tag))return false;
        string value=tag.Trim();
        if(value.StartsWith("win-",StringComparison.OrdinalIgnoreCase))value=value[4..];
        else if(value.StartsWith('v')||value.StartsWith('V'))value=value[1..];
        else return false;
        if(!Version.TryParse(value,out Version? parsed)||parsed.Major<0)return false;
        version=parsed;
        return true;
    }
}

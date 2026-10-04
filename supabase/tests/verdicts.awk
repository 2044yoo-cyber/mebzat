# Reads psql's printed output and decides whether a printed assertion failed.
#
# Three of these tests were written to be pasted into the Supabase SQL editor
# and read by a person: they `select ... as should_be_true` and print `t` or
# `f` rather than raising. Under a runner that only looks at the exit code they
# passed no matter what the answer was, and did — every assertion in three
# files was unchecked until mutation testing pointed at it.
#
# The column name says which value is the failure, and it is not always `f`:
# `should_be_false` columns exist and `t` is the failure there. So the header
# line is remembered and each following data row judged against it.
#
# Exit 1 if any assertion failed. With -v list=1, print the failing steps
# instead.

/\|/ && /should_be_true|should_be_false|passed/ {
    bad = /should_be_false/ ? "t" : "f"
    inblock = 1
    next
}
/^[-+]+$/ { next }
/^\(/ { inblock = 0; next }
inblock {
    # The verdict is the last pipe-separated field.
    n = split($0, parts, "|")
    if (n < 2) next
    gsub(/^[ \t]+|[ \t]+$/, "", parts[n])
    gsub(/^[ \t]+|[ \t]+$/, "", parts[1])
    if (parts[n] == bad) {
        failures++
        if (list && failures <= (max ? max : 6)) print "    " parts[1]
    }
}
END { exit(failures > 0 ? 1 : 0) }
